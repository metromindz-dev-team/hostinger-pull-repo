import app from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
await connectDatabase();
app.listen(env.port,()=>console.log(`API listening on http://localhost:${env.port}`));
