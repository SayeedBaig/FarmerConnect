const express = require('express');
const router = express.Router();

// =============================================
// CACHE — avoid hammering the API on every request
// =============================================
let cachedSchemes = null;
let cacheTimestamp = null;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

// =============================================
// FALLBACK — shown if API is down
// =============================================
const FALLBACK_SCHEMES = [
    {
        id: 1,
        title: "PM-Kisan Samman Nidhi",
        description: "Income support of ₹6,000 per year in three equal installments to farmer families.",
        tags: ["All Crops", "Financial Aid"],
        link: "https://pmkisan.gov.in"
    },
    {
        id: 2,
        title: "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
        description: "Crop insurance scheme providing financial support in case of crop failure due to natural calamities.",
        tags: ["Insurance", "All Crops"],
        link: "https://pmfby.gov.in/"
    },
    {
        id: 3,
        title: "Soil Health Card Scheme",
        description: "Helps farmers know the nutrient status of their soil and recommends appropriate dosage of nutrients.",
        tags: ["Soil", "All Crops"],
        link: "https://soilhealth.dac.gov.in/"
    },
    {
        id: 4,
        title: "Paramparagat Krishi Vikas Yojana (PKVY)",
        description: "Promotes organic farming practices with financial support of ₹50,000 per hectare.",
        tags: ["Organic", "Vegetables"],
        link: "https://pgsindia-ncof.gov.in/pkvy/index.aspx"
    },
    {
        id: 5,
        title: "National Mission on Micro Irrigation",
        description: "Subsidies for drip and sprinkler irrigation systems to conserve water.",
        tags: ["Irrigation", "Sugarcane", "Cotton"],
        link: "https://pmksy.gov.in/mis/mi/"
    },
    {
        id: 6,
        title: "Kisan Credit Card (KCC)",
        description: "Provides farmers with affordable credit for agricultural needs at low interest rates.",
        tags: ["Credit", "All Crops", "Financial Aid"],
        link: "https://www.nabard.org/content1.aspx?id=572"
    },
    {
        id: 7,
        title: "Agriculture Infrastructure Fund (AIF)",
        description: "Financing facility for post-harvest management and community farming assets.",
        tags: ["Infrastructure", "Storage", "All Crops"],
        link: "https://agriinfra.dac.gov.in/"
    },
    {
        id: 8,
        title: "National Agriculture Market (eNAM)",
        description: "Online trading platform for agricultural commodities to get better prices.",
        tags: ["Market", "All Crops"],
        link: "https://enam.gov.in"
    }
];

// =============================================
// FETCH FROM DATA.GOV.IN (live source)
// MyScheme API requires auth (returns 401) — skipped
// =============================================
async function fetchFromDataGov() {
    try {
        const apiKey = process.env.DATA_GOV_API_KEY;
        if (!apiKey) {
            console.warn('[Schemes] DATA_GOV_API_KEY not set in .env, skipping Data.gov.in');
            return null;
        }
        const url = `https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24?api-key=${apiKey}&format=json&limit=15`;

        const response = await fetch(url, {
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) throw new Error(`Data.gov.in API error: ${response.status}`);

        const data = await response.json();

        if (!data?.records?.length) return null;

        return data.records.map((record, index) => ({
            id: index + 1,
            title: record.scheme_name || record.title || 'Agricultural Scheme',
            description: record.description || record.details || 'Government agricultural support scheme.',
            tags: ['Agriculture', 'Government'],
            link: record.url || 'https://agricoop.nic.in/',
            ministry: record.ministry || 'Ministry of Agriculture',
            state: record.state || 'Central'
        }));

    } catch (err) {
        console.error('[Schemes] Data.gov.in API failed:', err.message);
        return null;
    }
}

// =============================================
// MAIN ROUTE
// =============================================
router.get('/', async (req, res) => {
    const { crop, location } = req.query;

    try {
        let schemes = null;

        // Check cache first
        if (cachedSchemes && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL_MS)) {
            console.log('[Schemes] Serving from cache');
            schemes = cachedSchemes;
        }

        // Try fetching live data from Data.gov.in
        if (!schemes) {
            console.log('[Schemes] Fetching live data...');
            schemes = await fetchFromDataGov();

            // Cache successful response
            if (schemes) {
                cachedSchemes = schemes;
                cacheTimestamp = Date.now();
                console.log(`[Schemes] Cached ${schemes.length} schemes`);
            }
        }

        // Fall back to hardcoded if all APIs fail
        if (!schemes || schemes.length === 0) {
            console.log('[Schemes] Using fallback data');
            schemes = FALLBACK_SCHEMES;
        }

        // Filter/sort by crop if provided
        if (crop) {
            const cropLower = crop.toLowerCase();

            // Sort: matching crop tags first
            schemes.sort((a, b) => {
                const aMatch = a.tags.some(t => t.toLowerCase().includes(cropLower));
                const bMatch = b.tags.some(t => t.toLowerCase().includes(cropLower));
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return 0;
            });
        }

        res.json(schemes);

    } catch (error) {
        console.error('[Schemes] Unexpected error:', error);
        res.json(FALLBACK_SCHEMES); // always return something
    }
});

module.exports = router;