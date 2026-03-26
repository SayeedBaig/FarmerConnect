import sys
import os
import json
import pickle

# Use absolute paths based on script location so it works when spawned by Express
_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(_DIR, "models", "classifier.pkl")
ENCODER_PATH = os.path.join(_DIR, "models", "fertilizer_encoder.pkl")

with open(MODEL_PATH, "rb") as f:
    model = pickle.load(f)

with open(ENCODER_PATH, "rb") as f:
    enc = pickle.load(f)

soil_enc = enc["soil_enc"]
crop_enc = enc["crop_enc"]
fert_enc = enc["fert_enc"]

def _get(data, *keys):
    """Get a value from data, trying multiple key names."""
    for k in keys:
        if k in data:
            return data[k]
    raise KeyError(f"Missing key: expected one of {keys}")

def predict(data):

    soil = soil_enc.transform([_get(data, "Soil Type", "SoilType")])[0]
    crop = crop_enc.transform([_get(data, "Crop Type", "CropType")])[0]

    features = [[
        _get(data, "Temparature", "Temperature", "temperature"),
        _get(data, "Humidity", "humidity"),
        _get(data, "Moisture", "moisture"),
        soil,
        crop,
        _get(data, "Nitrogen", "nitrogen"),
        _get(data, "Potassium", "potassium"),
        _get(data, "Phosphorous", "phosphorous")
    ]]

    pred = model.predict(features)[0]
    conf = max(model.predict_proba(features)[0])

    fert = fert_enc.inverse_transform([pred])[0]

    return {
        "fertilizer": fert,
        "confidence": round(conf * 100, 2)
    }

if __name__ == "__main__":
    data = json.loads(sys.argv[1])
    print(json.dumps(predict(data)))