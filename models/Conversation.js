import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
    {
        isGroup: { type: Boolean, default: false },
        name: { type: String }, // Used for group chats, but we generally might rely on Project names
        participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" }, // If this is a project chat
        latestMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    },
    { timestamps: true }
);

conversationSchema.index({ participants: 1, updatedAt: -1 });

export default mongoose.model("Conversation", conversationSchema);
