import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Project from "../models/Project.js";

// 1. Get all conversations for a user
export const getConversations = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Find all conversations where the user is a participant
        const conversations = await Conversation.find({ participants: userId })
            .populate("participants", "name employeePersonal.profilePhoto employeePersonal.fullName")
            .populate("latestMessage")
            .populate("project", "name")
            .sort({ updatedAt: -1 })
            .lean();

        const conversationIds = conversations.map(convo => convo._id);
        const unreadCounts = conversationIds.length
            ? await Message.aggregate([
                {
                    $match: {
                        conversationId: { $in: conversationIds },
                        sender: { $ne: userObjectId },
                        readBy: { $ne: userObjectId }
                    }
                },
                {
                    $group: {
                        _id: "$conversationId",
                        unreadCount: { $sum: 1 }
                    }
                }
            ])
            : [];

        const unreadCountMap = new Map(
            unreadCounts.map(item => [String(item._id), item.unreadCount])
        );

        res.status(200).json({
            success: true,
            conversations: conversations.map(convo => ({
                ...convo,
                unreadCount: unreadCountMap.get(String(convo._id)) || 0
            }))
        });
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ success: false, message: "Failed to fetch conversations" });
    }
};

// 2. Get or create a direct conversation
export const getOrCreateDirectConversation = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { targetUserId } = req.body;

        if (!targetUserId) {
            return res.status(400).json({ success: false, message: "Target user ID is required" });
        }

        // Check if a direct conversation already exists between these two users
        let conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: [userId, targetUserId], $size: 2 },
        }).populate("participants", "name employeePersonal.profilePhoto employeePersonal.fullName");

        if (!conversation) {
            // Create a new direct conversation
            conversation = await Conversation.create({
                isGroup: false,
                participants: [userId, targetUserId],
            });
            // Populate newly created conversation
            conversation = await conversation.populate("participants", "name employeePersonal.profilePhoto employeePersonal.fullName");
        }

        res.status(200).json({ success: true, conversation });
    } catch (error) {
        console.error("Error getting/creating conversation:", error);
        res.status(500).json({ success: false, message: "Failed to get/create conversation" });
    }
};

// 3. Get messages for a conversation
export const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user._id || req.user.id;

        // Verify the conversation exists and user is a participant
        const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });

        if (!conversation) {
            return res.status(404).json({ success: false, message: "Conversation not found or you don't have access" });
        }

        const updateResult = await Message.updateMany(
            {
                conversationId,
                sender: { $ne: userId },
                readBy: { $ne: userId },
            },
            {
                $addToSet: { readBy: userId },
                $set: { updatedAt: new Date() }
            }
        );

        // Emit socket event to notify other participants that messages were read
        const io = req.app.get("io");
        if (io && updateResult.modifiedCount > 0) {
            io.to(conversationId.toString()).emit("messages_read", {
                conversationId,
                readBy: userId,
                readAt: new Date(),
            });
        }

        const messages = await Message.find({ conversationId })
            .populate("sender", "name employeePersonal.profilePhoto employeePersonal.fullName")
            .populate({
                path: "parentMessage",
                populate: { path: "sender", select: "name" }
            })
            .sort({ createdAt: 1 }); // Oldest first for chat history

        res.status(200).json({ success: true, messages, conversation });
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ success: false, message: "Failed to fetch messages" });
    }
};

export const markConversationAsRead = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user._id || req.user.id;

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId,
        });

        if (!conversation) {
            return res.status(404).json({ success: false, message: "Conversation not found or you don't have access" });
        }

        const result = await Message.updateMany(
            {
                conversationId,
                sender: { $ne: userId },
                readBy: { $ne: userId },
            },
            {
                $addToSet: { readBy: userId },
                $set: { updatedAt: new Date() }
            }
        );

        // Emit socket event to notify other participants that messages were read
        const io = req.app.get("io");
        if (io && result.modifiedCount > 0) {
            io.to(conversationId.toString()).emit("messages_read", {
                conversationId,
                readBy: userId,
                readAt: new Date(),
            });
        }

        res.status(200).json({
            success: true,
            modifiedCount: result.modifiedCount || 0,
        });
    } catch (error) {
        console.error("Error marking conversation as read:", error);
        res.status(500).json({ success: false, message: "Failed to mark messages as read" });
    }
};

// 4. Send a message
export const sendMessage = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { conversationId, text, parentMessageId } = req.body;

        // Handle uploaded files mapping
        let attachments = [];
        if (req.files && req.files.documents) {
            // If upload.array('documents') was used
            attachments = req.files.documents.map(file => ({
                url: `/uploads/documents/${file.filename}`,
                name: file.originalname,
                type: file.mimetype
            }));
        } else if (req.files && Array.isArray(req.files)) {
            attachments = req.files.map((file) => ({
                url: `/uploads/documents/${file.filename}`,
                name: file.originalname,
                type: file.mimetype,
            }));
        }

        if (!text && attachments.length === 0) {
            return res.status(400).json({ success: false, message: "Message text or attachments are required" });
        }

        // Verify the conversation exists and user is a participant
        const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });

        if (!conversation) {
            return res.status(404).json({ success: false, message: "Conversation not found or you don't have access" });
        }

        const message = await Message.create({
            conversationId,
            sender: userId,
            text: text || "",
            attachments,
            parentMessage: parentMessageId || null,
            readBy: [userId],
        });

        // Populate info for the socket event
        await message.populate([
            { path: "sender", select: "name employeePersonal.profilePhoto employeePersonal.fullName" },
            {
                path: "parentMessage",
                populate: { path: "sender", select: "name" }
            }
        ]);

        // Update conversation's latest message
        conversation.latestMessage = message._id;
        await conversation.save();

        // Emit socket events
        const io = req.app.get("io");
        if (io) {
            // Emit to the conversation room (for those already in the chat window)
            io.to(message.conversationId.toString()).emit("receive_message", message);

            // Targeted alert to participants (for badge counters and toasts)
            conversation.participants.forEach(participantId => {
                const pId = participantId.toString();
                // We send it to everyone in the conversation. 
                // The frontend NavBadgeContext will skip if sender is self.
                io.to(`user_${pId}`).emit("new_message_alert", message);
            });
        }

        res.status(200).json({ success: true, message });
    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ success: false, message: "Failed to send message" });
    }
};

// 6. Delete a message
export const deleteMessage = async (req, res) => {
    try {
        const { messageId: messageIdRaw } = req.params;
        const userIdRaw = req.user?._id || req.user?.id;

        if (!userIdRaw) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        const message = await Message.findOne({ _id: messageIdRaw, sender: userIdRaw });

        if (!message) {
            console.warn(`Message not found or permission denied: msg=${messageId}, user=${userId}`);
            return res.status(404).json({ success: false, message: "Message not found or you don't have permission to delete it" });
        }

        // Soft delete: clear text and attachments, mark as deleted
        message.text = "This message was deleted";
        message.attachments = [];
        message.isDeleted = true;
        await message.save();

        // Emit socket events
        const io = req.app.get("io");
        if (io) {
            io.emit("message_deleted", {
                messageId: message._id.toString(),
                conversationId: message.conversationId.toString()
            });
        }

        res.status(200).json({ success: true, message });
    } catch (error) {
        console.error("Error deleting message:", error);
        res.status(500).json({ success: false, message: "Failed to delete message" });
    }
};

// 7. React to a message
export const reactToMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { emoji } = req.body;
        const userId = req.user._id || req.user.id;

        if (!emoji) {
            return res.status(400).json({ success: false, message: "Emoji is required" });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: "Message not found" });
        }

        // Initialize reactions if it doesn't exist (for existing messages)
        if (!message.reactions) message.reactions = [];

        // Check if user already reacted with this emoji
        const existingReactionIndex = message.reactions.findIndex(
            r => r.user.toString() === userId.toString() && r.emoji === emoji
        );

        if (existingReactionIndex > -1) {
            // Remove the reaction (toggle off)
            message.reactions.splice(existingReactionIndex, 1);
        } else {
            // Check if user has ANY reaction and remove it first (limit 1 reaction per user)
            const otherReactionIndex = message.reactions.findIndex(
                r => r.user.toString() === userId.toString()
            );
            if (otherReactionIndex > -1) {
                message.reactions.splice(otherReactionIndex, 1);
            }
            // Add new reaction
            message.reactions.push({ user: userId, emoji });
        }

        await message.save();
        await message.populate("reactions.user", "name employeePersonal.profilePhoto");

        // Emit socket event for real-time update
        const io = req.app.get("io");
        if (io) {
            io.to(message.conversationId.toString()).emit("message_reaction", {
                messageId: message._id,
                conversationId: message.conversationId,
                reactions: message.reactions
            });
        }

        res.status(200).json({ success: true, reactions: message.reactions });
    } catch (error) {
        console.error("Error reacting to message:", error);
        res.status(500).json({ success: false, message: "Failed to react to message" });
    }
};

// 8. Clear all messages in a conversation
export const clearConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user._id || req.user.id;

        // Verify the conversation exists and user is a participant
        const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });

        if (!conversation) {
            return res.status(404).json({ success: false, message: "Conversation not found or you don't have access" });
        }

        // Delete all messages in the conversation
        await Message.deleteMany({ conversationId });

        // Update conversation's latest message to null
        conversation.latestMessage = null;
        await conversation.save();

        // Emit socket event to notify other participants
        const io = req.app.get("io");
        if (io) {
            io.to(conversationId.toString()).emit("chat_cleared", { conversationId });
        }

        res.status(200).json({ success: true, message: "Chat cleared successfully" });
    } catch (error) {
        console.error("Error clearing conversation:", error);
        res.status(500).json({ success: false, message: "Failed to clear chat" });
    }
};

// 5. Create Project Group Chat (Helper, not a direct route typically)
export const createProjectGroupChat = async (projectId, projectDetails, developers) => {
    try {
        const existingConvo = await Conversation.findOne({ project: projectId, isGroup: true });

        let participantIds = developers.map(dev => (typeof dev === 'object' && dev._id) ? dev._id.toString() : dev.toString());

        if (existingConvo) {
            // Update participants
            existingConvo.participants = participantIds;
            existingConvo.name = projectDetails.name; // Keep name in sync
            await existingConvo.save();
            return existingConvo;
        }

        const newConvo = await Conversation.create({
            isGroup: true,
            name: projectDetails.name,
            project: projectId,
            participants: participantIds
        });

        return newConvo;
    } catch (err) {
        console.error("Failed to create project group chat:", err);
    }
}
