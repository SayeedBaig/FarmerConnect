const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    user_id:      { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    message:      { type: String, required: true },
    is_bot_reply: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Chat', chatSchema);
