const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    phone: {
        type:   String,
        unique: true,
        sparse: true    // ✅ allows docs without phone (e.g. email-only signups)
    },
    email: {
        type:   String,
        unique: true,
        sparse: true    // ✅ allows docs without email (e.g. phone-only signups)
    },
    password: {
        type:     String,
        required: true
    },
    name:      String,
    language:  { type: String, default: 'en' },
    location:  String,
    crop_type: String,
    soil_type: String,
    points: {
        type:    Number,
        default: 0
    },
    points_today: {
        type:    Number,
        default: 0
    },
    last_point_date: String,
    role: {
        type:    String,
        default: 'farmer'   // ✅ kept from your original
    }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);