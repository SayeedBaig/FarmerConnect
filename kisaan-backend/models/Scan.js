const mongoose = require('mongoose');

const scanSchema = new mongoose.Schema({
    user_id:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    image_url:         { type: String, required: true },
    disease_predicted: { type: String, default: '' },
    confidence:        { type: String, default: '' },
    treatment:         { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Scan', scanSchema);
