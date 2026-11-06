import express from "express";
import { protect } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import {
    getConversations,
    getOrCreateDirectConversation,
    getMessages,
    markConversationAsRead,

    sendMessage,
    deleteMessage,
    reactToMessage,
    clearConversation
} from "../controllers/chatController.js";

const router = express.Router();

// Apply auth middleware to all chat routes
router.use(protect);

router.get("/conversations", getConversations);
router.post("/conversations/direct", getOrCreateDirectConversation);
router.get("/messages/:conversationId", getMessages);
router.patch("/messages/:conversationId/read", markConversationAsRead);
router.delete("/messages/:messageId", deleteMessage);
router.post("/messages/:messageId/react", reactToMessage);
router.delete("/conversations/:conversationId/messages", clearConversation);
// Using the existing upload middleware for file attachments (limit 5 files)
router.post("/send", upload.array('documents', 5), sendMessage);

export default router;
