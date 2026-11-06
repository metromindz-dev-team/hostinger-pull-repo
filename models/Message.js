import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
    {
        conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        text: { type: String, default: "" },
        attachments: [
            {
                url: { type: String },
                name: { type: String },
                type: { type: String },
            }
        ],
        isEdited: { type: Boolean, default: false },
        isDeleted: { type: Boolean, default: false },
        parentMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
        readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        reactions: [
            {
                user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                emoji: { type: String }
            }
        ],
    },
    { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, sender: 1 });

export default mongoose.model("Message", messageSchema);
