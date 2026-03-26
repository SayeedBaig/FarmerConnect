const mongoose = require('mongoose');

const advisorySchema = new mongoose.Schema({
    user_id:    { type: String, required: true, index: true },
    fertilizer: { type: String, required: true },
    confidence: { type: Number, default: 0 },
    input:      { type: Object }
}, { timestamps: true });

module.exports = mongoose.model('Advisory', advisorySchema);