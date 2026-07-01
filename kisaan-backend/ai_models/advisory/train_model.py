"""
train_model.py — Trains the fertilizer recommendation classifier
and saves classifier.pkl + fertilizer_encoder.pkl to the models/ directory.
Run once: python train_model.py
"""

import os
import pickle
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder

_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

# ─── Training Data ───────────────────────────────────────────────────────────
# Columns: Temperature, Humidity, Moisture, SoilType, CropType, Nitrogen, Potassium, Phosphorous → Fertilizer
# Soil types:  Sandy, Loamy, Black, Red, Clayey
# Crop types:  Maize, Sugarcane, Cotton, Tobacco, Paddy, Barley, Wheat, Millets, Oil seeds, Pulses, Ground Nuts
# Fertilizers: Urea, DAP, 14-35-14, 28-28, 17-17-17, 20-20, 10-26-26

RAW = [
    # Temp, Humidity, Moisture, Soil,    Crop,        N,  K,  P,  Fertilizer
    (26,    52,       38,       "Sandy",  "Maize",      37, 0,  0,  "Urea"),
    (29,    52,       45,       "Loamy",  "Sugarcane",  12, 0,  36, "DAP"),
    (34,    65,       62,       "Black",  "Cotton",     7,  9,  30, "14-35-14"),
    (32,    62,       34,       "Red",    "Tobacco",    20, 0,  27, "28-28"),
    (28,    54,       40,       "Clayey", "Paddy",      35, 0,  0,  "Urea"),
    (25,    45,       55,       "Loamy",  "Barley",     14, 0,  42, "DAP"),
    (30,    55,       35,       "Sandy",  "Wheat",      30, 0,  0,  "Urea"),
    (27,    67,       80,       "Black",  "Millets",    20, 20, 0,  "17-17-17"),
    (31,    70,       40,       "Red",    "Oil seeds",  10, 26, 26, "10-26-26"),
    (29,    52,       50,       "Clayey", "Pulses",     10, 18, 9,  "20-20"),
    (26,    52,       38,       "Sandy",  "Ground Nuts",20, 0,  18, "28-28"),
    (34,    65,       62,       "Loamy",  "Maize",      37, 9,  0,  "Urea"),
    (29,    52,       45,       "Black",  "Sugarcane",  12, 0,  36, "DAP"),
    (32,    62,       34,       "Red",    "Cotton",     7,  9,  30, "14-35-14"),
    (28,    54,       40,       "Clayey", "Tobacco",    20, 0,  27, "28-28"),
    (25,    45,       55,       "Sandy",  "Paddy",      35, 0,  0,  "Urea"),
    (30,    55,       35,       "Loamy",  "Barley",     14, 0,  42, "DAP"),
    (27,    67,       80,       "Black",  "Wheat",      30, 0,  0,  "Urea"),
    (31,    70,       40,       "Red",    "Millets",    20, 20, 0,  "17-17-17"),
    (26,    52,       38,       "Clayey", "Oil seeds",  10, 26, 26, "10-26-26"),
    (29,    55,       50,       "Sandy",  "Pulses",     10, 18, 9,  "20-20"),
    (34,    65,       62,       "Loamy",  "Ground Nuts",20, 0,  18, "28-28"),
    (32,    62,       34,       "Black",  "Maize",      37, 0,  0,  "Urea"),
    (28,    54,       40,       "Red",    "Sugarcane",  12, 0,  36, "DAP"),
    (25,    45,       55,       "Clayey", "Cotton",     7,  9,  30, "14-35-14"),
    (30,    55,       35,       "Sandy",  "Tobacco",    20, 0,  27, "28-28"),
    (27,    67,       80,       "Loamy",  "Paddy",      35, 0,  0,  "Urea"),
    (31,    70,       40,       "Black",  "Barley",     14, 0,  42, "DAP"),
    (26,    52,       38,       "Red",    "Wheat",      30, 0,  0,  "Urea"),
    (29,    52,       45,       "Clayey", "Millets",    20, 20, 0,  "17-17-17"),
    (34,    65,       62,       "Sandy",  "Oil seeds",  10, 26, 26, "10-26-26"),
    (32,    62,       34,       "Loamy",  "Pulses",     10, 18, 9,  "20-20"),
    (28,    54,       40,       "Black",  "Ground Nuts",20, 0,  18, "28-28"),
    (25,    45,       55,       "Red",    "Maize",      37, 9,  0,  "Urea"),
    (30,    55,       35,       "Clayey", "Sugarcane",  12, 0,  36, "DAP"),
    (26,    52,       38,       "Sandy",  "Cotton",     7,  9,  30, "14-35-14"),
    (29,    52,       45,       "Loamy",  "Tobacco",    20, 0,  27, "28-28"),
    (34,    65,       62,       "Black",  "Paddy",      35, 0,  0,  "Urea"),
    (32,    62,       34,       "Red",    "Barley",     14, 0,  42, "DAP"),
    (28,    54,       40,       "Clayey", "Wheat",      30, 0,  0,  "Urea"),
]

# ─── Encode categorical features ─────────────────────────────────────────────
soil_enc = LabelEncoder()
crop_enc  = LabelEncoder()
fert_enc  = LabelEncoder()

soils  = [r[3] for r in RAW]
crops  = [r[4] for r in RAW]
ferts  = [r[8] for r in RAW]

soil_enc.fit(sorted(set(soils)))
crop_enc.fit(sorted(set(crops)))
fert_enc.fit(sorted(set(ferts)))

X = []
y = []
for r in RAW:
    temp, hum, moist, soil, crop, n, k, p, fert = r
    X.append([
        temp,
        hum,
        moist,
        soil_enc.transform([soil])[0],
        crop_enc.transform([crop])[0],
        n, k, p
    ])
    y.append(fert_enc.transform([fert])[0])

X = np.array(X)
y = np.array(y)

# ─── Train ────────────────────────────────────────────────────────────────────
clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(X, y)
print(f"Training accuracy: {clf.score(X, y)*100:.1f}%")

# ─── Save ─────────────────────────────────────────────────────────────────────
with open(os.path.join(MODELS_DIR, "classifier.pkl"), "wb") as f:
    pickle.dump(clf, f)

with open(os.path.join(MODELS_DIR, "fertilizer_encoder.pkl"), "wb") as f:
    pickle.dump({
        "soil_enc": soil_enc,
        "crop_enc": crop_enc,
        "fert_enc": fert_enc
    }, f)

print(f"✅ Models saved to {MODELS_DIR}")
print(f"   Soil types : {list(soil_enc.classes_)}")
print(f"   Crop types : {list(crop_enc.classes_)}")
print(f"   Fertilizers: {list(fert_enc.classes_)}")
