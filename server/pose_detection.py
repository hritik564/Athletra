#!/usr/bin/env python3
import sys
import json
import base64
import math
import os
import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.vision import drawing_utils, drawing_styles, PoseLandmarksConnections

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "models", "pose_landmarker_heavy.task")

LANDMARK_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_pinky", "right_pinky",
    "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle", "left_heel", "right_heel",
    "left_foot_index", "right_foot_index"
]

ANGLE_DEFS = [
    ("left_elbow", 11, 13, 15),
    ("right_elbow", 12, 14, 16),
    ("left_shoulder", 13, 11, 23),
    ("right_shoulder", 14, 12, 24),
    ("left_hip", 11, 23, 25),
    ("right_hip", 12, 24, 26),
    ("left_knee", 23, 25, 27),
    ("right_knee", 24, 26, 28),
    ("left_ankle", 25, 27, 31),
    ("right_ankle", 26, 28, 32),
    ("torso_lean", 11, 23, 25),
]


def calc_angle(a, b, c):
    ba = np.array([a.x - b.x, a.y - b.y, a.z - b.z])
    bc = np.array([c.x - b.x, c.y - b.y, c.z - b.z])
    cos_val = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    return round(math.degrees(math.acos(np.clip(cos_val, -1, 1))), 1)


def analyze_image(img_b64, landmarker):
    raw = base64.b64decode(img_b64)
    arr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return {"detected": False}

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = landmarker.detect(mp_image)

    if not result.pose_landmarks or len(result.pose_landmarks) == 0:
        return {"detected": False, "annotated_image": img_b64}

    pose_lms = result.pose_landmarks[0]

    landmarks = {}
    for i, name in enumerate(LANDMARK_NAMES):
        if i < len(pose_lms):
            lm = pose_lms[i]
            landmarks[name] = {
                "x": round(lm.x, 4),
                "y": round(lm.y, 4),
                "z": round(lm.z, 4),
                "visibility": round(lm.visibility, 3)
            }

    angles = {}
    for name, a, b, c in ANGLE_DEFS:
        if (a < len(pose_lms) and b < len(pose_lms) and c < len(pose_lms)
                and pose_lms[a].visibility > 0.5
                and pose_lms[b].visibility > 0.5
                and pose_lms[c].visibility > 0.5):
            angles[name] = calc_angle(pose_lms[a], pose_lms[b], pose_lms[c])

    shoulder_diff = abs(pose_lms[11].y - pose_lms[12].y)
    hip_diff = abs(pose_lms[23].y - pose_lms[24].y)
    symmetry = {
        "shoulder_level_diff": round(shoulder_diff, 4),
        "hip_level_diff": round(hip_diff, 4),
        "shoulders_aligned": shoulder_diff < 0.03,
        "hips_aligned": hip_diff < 0.03,
    }

    h, w = img.shape[:2]
    connections = PoseLandmarksConnections.POSE_LANDMARKS
    landmark_drawing_spec = drawing_styles.get_default_pose_landmarks_style()
    connection_spec = drawing_utils.DrawingSpec(color=(0, 255, 0), thickness=2)

    drawing_utils.draw_landmarks(
        img,
        result.pose_landmarks[0],
        connections,
        landmark_drawing_spec,
        connection_spec
    )

    for angle_name, a_idx, b_idx, c_idx in ANGLE_DEFS:
        if angle_name in angles and b_idx < len(pose_lms):
            px = int(pose_lms[b_idx].x * w)
            py = int(pose_lms[b_idx].y * h)
            cv2.putText(img, f"{angles[angle_name]:.0f}", (px + 8, py - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
            cv2.putText(img, f"{angles[angle_name]:.0f}", (px + 7, py - 9),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 2, cv2.LINE_AA)
            cv2.putText(img, f"{angles[angle_name]:.0f}", (px + 8, py - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

    _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buf).decode('utf-8')

    return {
        "detected": True,
        "landmarks": landmarks,
        "angles": angles,
        "symmetry": symmetry,
        "annotated_image": annotated_b64
    }


def main():
    try:
        input_data = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        sys.stdout.write(json.dumps({"error": f"Invalid JSON input: {str(e)}", "results": []}))
        sys.stdout.flush()
        return

    images = input_data.get("images", [])

    base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        output_segmentation_masks=False,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    try:
        landmarker = vision.PoseLandmarker.create_from_options(options)
    except Exception as e:
        sys.stdout.write(json.dumps({"error": f"Failed to load model: {str(e)}", "results": []}))
        sys.stdout.flush()
        return

    results = []
    with landmarker:
        for img_b64 in images:
            try:
                if img_b64.startswith("data:"):
                    img_b64 = img_b64.split(",", 1)[1]
                r = analyze_image(img_b64, landmarker)
                results.append(r)
            except Exception as e:
                results.append({"detected": False, "error": str(e)})

    output = json.dumps({"results": results})
    sys.stdout.write(output)
    sys.stdout.flush()


if __name__ == "__main__":
    main()
