import mongoose from "mongoose";

const ipLockSchema = new mongoose.Schema(
    {
        ip: { type: String, required: true, unique: true },
        failedAttempts: { type: Number, default: 0 },
        lockoutUntil: { type: Date, default: null },
        lastAttemptAt: { type: Date, default: Date.now },
    },
    { timestamps: true, collection: "ip_locks" }
);

// Index to automatically expire old lock records if needed, 
// though we usually keep them for audit or manual reset.
// For now, let's just use it as a simple store.

export default mongoose.model("IpLock", ipLockSchema);
