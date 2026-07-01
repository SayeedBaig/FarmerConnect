const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

const User = require('../models/User');
const Chat = require('../models/Chat');
const Scan = require('../models/Scan');

const router = express.Router();

const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8000';

// =============================================
// MULTER — image uploads
// =============================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// =============================================
// HELPER — get or create demo user
// =============================================
async function getOrCreateUser(user_id) {
    let user = await User.findById(user_id).catch(() => null);

    if (!user) {
        user = await User.create({
            _id:      user_id,
            name:     'Demo Farmer',
            phone:    `demo-${Date.now()}`,
            language: 'en',
            location: 'Unknown',
            crop_type:'Unknown',
            soil_type:'Unknown',
            points:   10
        });
    }

    return user;
}

// =============================================
// HELPER — points logic (max 20/day)
// =============================================
async function addDailyPoints(user) {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastDate = user.last_point_date
        ? new Date(user.last_point_date).toISOString().split('T')[0]
        : null;

    let pToday = lastDate === todayStr ? (user.points_today || 0) : 0;
    let pointsEarned = 0;

    if (pToday < 20) {
        pointsEarned = Math.min(20, 20 - pToday);
        pToday += pointsEarned;

        await User.findByIdAndUpdate(user._id, {
            $inc: { points: pointsEarned },
            points_today:    pToday,
            last_point_date: new Date()
        });
    }

    return pointsEarned;
}

// =============================================
// 1. POST /register
// =============================================
router.post('/register', async (req, res) => {
    const { phone, name, language, location, crop_type, soil_type } = req.body;

    try {
        const existing = await User.findOne({ phone });
        if (existing) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const user = await User.create({
            phone, name, language, location, crop_type, soil_type,
            points: 10
        });

        res.json({ id: user._id, message: 'User registered successfully with 10 welcome points!' });

    } catch (error) {
        console.error('[Register] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// 2. POST /chat
// =============================================
router.post('/chat', async (req, res) => {
    const { user_id, message } = req.body;

    try {
        const user     = await getOrCreateUser(user_id);
        const langPref = user.language || 'en';

        // Save user message
        await Chat.create({ user_id: user._id, message, is_bot_reply: false });

        // Fetch last 5 messages for context
        const history = await Chat.find({ user_id: user._id })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        // Build Gemini prompt
        const systemPrompt = `You are Kisaan Mitra AI, a helpful agricultural expert for Indian farmers.
Reply concisely and practically. 
IMPORTANT: Respond in this language: "${langPref}".`;

        // Build conversation history text
        let conversationHistory = '';
        for (const msg of history.reverse()) {
            if (msg.message !== message) {
                const role = msg.is_bot_reply ? 'Assistant' : 'User';
                conversationHistory += `${role}: ${msg.message}\n`;
            }
        }

        const fullPrompt = `${systemPrompt}\n\n${conversationHistory}User: ${message}\nAssistant:`;

        // Call Gemini API directly
        let botReply = "I'm sorry, I couldn't process your request.";

        try {
            const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
            if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
                throw new Error('GEMINI_API_KEY is not set in .env');
            }

            // Try models in order — each has its own quota bucket
            const MODELS = [
                'gemini-1.5-flash',
                'gemini-1.5-flash-8b',
                'gemini-1.0-pro',
                'gemini-2.0-flash'
            ];

            let lastError = null;
            for (const model of MODELS) {
                try {
                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

                    const controller = new AbortController();
                    const timeoutId  = setTimeout(() => controller.abort(), 30000);

                    const response = await fetch(geminiUrl, {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({
                            contents: [{ parts: [{ text: fullPrompt }] }],
                            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);

                    if (response.status === 429 || response.status === 403) {
                        // Quota or key issue — try next model
                        const errBody = await response.text();
                        console.warn(`[Chat] Model ${model} unavailable (${response.status}), trying next...`);
                        lastError = new Error(`${model} error ${response.status}: ${errBody}`);
                        continue;
                    }

                    if (!response.ok) {
                        const errBody = await response.text();
                        throw new Error(`Gemini API error ${response.status}: ${errBody}`);
                    }

                    const data = await response.json();
                    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        botReply = text.trim();
                        console.log(`[Chat] Replied using model: ${model}`);
                    }
                    lastError = null;
                    break; // success — stop trying

                } catch (modelErr) {
                    if (modelErr.name === 'AbortError') throw modelErr;
                    lastError = modelErr;
                    console.warn(`[Chat] Model ${model} failed:`, modelErr.message);
                }
            }

            // If all models failed, use smart rule-based fallback
            if (lastError) {
                console.warn('[Chat] All Gemini models failed. Using rule-based fallback.');
                const q = message.toLowerCase();
                if (q.includes('fertilizer') || q.includes('khad') || q.includes('urea')) {
                    botReply = 'For fertilizer advice, get a soil health card first. Generally: Urea for nitrogen, DAP for phosphorus. Apply based on your crop stage.';
                } else if (q.includes('pest') || q.includes('disease') || q.includes('insect')) {
                    botReply = 'For pest control, use integrated pest management (IPM). Contact your local Krishi Vigyan Kendra (KVK) for region-specific advice.';
                } else if (q.includes('water') || q.includes('irrigation') || q.includes('sinchhai')) {
                    botReply = 'Drip irrigation saves 30-50% water. Irrigate in morning or evening to reduce evaporation. Check soil moisture before watering.';
                } else if (q.includes('weather') || q.includes('rain') || q.includes('monsoon')) {
                    botReply = 'Check IMD (mausam.imd.gov.in) for weather forecasts. Plan sowing and harvesting around monsoon patterns in your region.';
                } else if (q.includes('price') || q.includes('market') || q.includes('mandi')) {
                    botReply = 'Check the Market Prices tab for live mandi rates. You can also check eNAM (enam.gov.in) for national market prices.';
                } else {
                    botReply = 'I\'m your Kisaan Mitra AI assistant. I can help with fertilizer advice, pest control, irrigation, weather, and market prices. What would you like to know?';
                }
            }

        } catch (err) {
            console.error('[Chat] Gemini API Error:', err.message);
            const errMsg = err.name === 'AbortError'
                ? '⏳ The AI is taking too long. Please try again.'
                : `⚠️ AI service error: ${err.message}`;
            await Chat.create({ user_id: user._id, message: errMsg, is_bot_reply: true });
            return res.status(503).json({ error: errMsg });
        }


        // Save bot reply
        await Chat.create({ user_id: user._id, message: botReply, is_bot_reply: true });

        // Add points
        const pointsEarned = await addDailyPoints(user);

        res.json({ reply: botReply, points_earned: pointsEarned });

    } catch (error) {
        console.error('[Chat] Error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate AI response.' });
    }
});

// =============================================
// 3. POST /upload-image
// =============================================
router.post('/upload-image', upload.single('image'), async (req, res) => {
    const { user_id } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const imageUrl = req.file.path;

    try {
        const user = await getOrCreateUser(user_id);

        const fileBytes  = fs.readFileSync(imageUrl);
        const base64Data = fileBytes.toString('base64');

        let parsedData = {
            diseasePredicted: 'Analysis Failed',
            confidence:       '0%',
            treatment:        'Could not process image.'
        };

        try {
            const controller = new AbortController();
            const timeoutId  = setTimeout(() => controller.abort(), 120000);

            const response = await fetch(`${LLM_SERVICE_URL}/analyze-image`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ image_base64: base64Data }),
                signal:  controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`Vision service error ${response.status}: ${errBody}`);
            }

            const data = await response.json();
            if (data) {
                parsedData = {
                    diseasePredicted: data.diseasePredicted || 'Analysis Completed',
                    confidence:       data.confidence       || 'N/A',
                    treatment:        data.treatment        || 'See full response above.'
                };
            }

        } catch (err) {
            console.error('[Upload] Vision Service Error:', err.message);
            const errMsg = err.name === 'AbortError'
                ? '⏳ The AI is still loading. Please wait 30 seconds and try again.'
                : '⚠️ Vision AI service error. Make sure the FastAPI service is running on port 8000.';

            await Scan.create({
                user_id:          user._id,
                image_url:        imageUrl,
                disease_predicted: parsedData.diseasePredicted,
                confidence:       parsedData.confidence,
                treatment:        errMsg
            });

            return res.status(503).json({
                error:            errMsg,
                diseasePredicted: parsedData.diseasePredicted,
                confidence:       parsedData.confidence,
                treatment:        errMsg,
                imageUrl,
                points_earned:    0
            });
        }

        // Check scans today for points
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const scanCountToday = await Scan.countDocuments({
            user_id:   user._id,
            createdAt: { $gte: startOfDay }
        });

        // Save scan
        await Scan.create({
            user_id:           user._id,
            image_url:         imageUrl,
            disease_predicted: parsedData.diseasePredicted,
            confidence:        parsedData.confidence,
            treatment:         parsedData.treatment
        });

        // 10 points for first scan of the day
        let pointsEarned = 0;
        if (scanCountToday < 1) {
            pointsEarned = 10;
            await User.findByIdAndUpdate(user._id, { $inc: { points: 10 } });
        }

        res.json({
            diseasePredicted: parsedData.diseasePredicted,
            confidence:       parsedData.confidence,
            treatment:        parsedData.treatment,
            imageUrl,
            points_earned:    pointsEarned
        });

    } catch (error) {
        console.error('[Upload] Error:', error);
        res.status(500).json({ error: error.message || 'Failed to process image scan.' });
    }
});

// =============================================
// 4. GET /points/:user_id
// =============================================
router.get('/points/:user_id', async (req, res) => {
    try {
        const user = await User.findById(req.params.user_id).select('points');
        res.json({ points: user ? user.points : 0 });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch points' });
    }
});

module.exports = router;