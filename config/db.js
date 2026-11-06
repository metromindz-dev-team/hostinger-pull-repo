import mongoose from "mongoose";

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.error("[Startup] Missing MONGO_URI. Database connection skipped.");
    return false;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    // console.log(`[Startup] MongoDB connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`[Startup] MongoDB connection failed: ${error.message}`);
    // Removed process.exit(1) to prevent crash loops in Elastic Beanstalk
    return false;
  }
};

export default connectDB;
