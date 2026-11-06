import mongoose from "mongoose";

const digitalAssetSchema = new mongoose.Schema(
    {
        industry: { type: String, required: true },
        websiteName: { type: String, required: true },
        websiteUrl: { type: String, required: true },
        websiteType: {
            type: String,
            enum: [
                "HTML Website",
                "WordPress",
                "WordPress + HTML Website",
                "React / Next.js",
                "Laravel",
                "Shopify",
                "MERN Stack",
                "PHP Custom",
                "Webflow",
                "Wix"
            ],
            required: true,
        },

        loginUrl: { type: String },
        loginUsername: { type: String },
        loginPassword: { type: String }, // Encrypted

            hostingManagedBy: { type: String },
        hostingProvider: { type: String },
        hostingUsername: { type: String },
        hostingPassword: { type: String }, // Encrypted
        hostingExpiryDate: { type: Date },

        domainManagedBy: { type: String, },
        domainName: { type: String },
        domainUsername: { type: String },
        domainPassword: { type: String }, // Encrypted
        domainExpiryDate: { type: Date },

        notes: { type: String },
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true }
);

export default mongoose.model("DigitalAsset", digitalAssetSchema);
