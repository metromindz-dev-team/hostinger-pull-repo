import mongoose from "mongoose";

const AMCSchema = new mongoose.Schema({
    companyName: {
        type: String,
        required: [true, "Company name is required"],
        trim: true
    },
    contactPerson: {
        type: String,
        required: [true, "Contact person is required"],
        trim: true
    },
    contactNumber: {
        type: String,
        required: [true, "Contact number is required"],
        trim: true
    },
    emailId: {
        type: String,
        required: [true, "Email ID is required"],
        trim: true,
        lowercase: true
    },
    // AMC Contract Details
    dateOfCommencing: {
        type: Date,
        required: [true, "Date of commencing is required"]
    },
    amcTerm: {
        type: String,
        enum: ["1 Year", "2 Years", "3 Years", "Custom"],
        required: true
    },
    contractFrom: {
        type: Date,
        required: true
    },
    contractTo: {
        type: Date,
        required: true
    },
    amcValue: {
        type: Number,
        required: true
    },
    paymentFrequency: {
        type: String,
        enum: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"],
        required: true
    },
    // Service Details
    serviceType: {
        type: String,
        enum: ["Website Maintenance", "Software Support", "Server Maintenance", "IT Support", "Custom Development"],
        required: true
    },
    // AMC Status
    status: {
        type: String,
        enum: ["Active", "Expiring Soon", "Expired", "Renewed", "Terminated"],
        default: "Active"
    },
    // Renewal & Alerts
    renewalReminderDays: {
        type: Number,
        default: 15
    },
    nextRenewalDate: {
        type: Date
    },
    // Documents
    agreementUrl: {
        type: String
    },
    invoiceUrl: {
        type: String
    },
    contractDocuments: [{
        type: String
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }
}, { timestamps: true });

// Middleware to calculate status and next renewal date
AMCSchema.pre("save", function (next) {
    if (this.contractTo) {
        const today = new Date();
        const expiry = new Date(this.contractTo);
        const diffTime = expiry - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            this.status = "Expired";
        } else if (diffDays <= this.renewalReminderDays) {
            this.status = "Expiring Soon";
        }

        // Set next renewal date to contractTo + 1 day (or could just be contractTo)
        this.nextRenewalDate = expiry;
    }
    next();
});

const AMCClient = mongoose.model("AMCClient", AMCSchema);
export default AMCClient;
