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

SYMMETRY_PAIRS = [
    ("left_elbow", "right_elbow"),
    ("left_shoulder", "right_shoulder"),
    ("left_hip", "right_hip"),
    ("left_knee", "right_knee"),
    ("left_ankle", "right_ankle"),
]

ROM_REFERENCE = {
    "left_elbow":     {"min": 30,  "max": 170, "label": "Elbow Flexion"},
    "right_elbow":    {"min": 30,  "max": 170, "label": "Elbow Flexion"},
    "left_shoulder":  {"min": 20,  "max": 180, "label": "Shoulder Flexion"},
    "right_shoulder": {"min": 20,  "max": 180, "label": "Shoulder Flexion"},
    "left_hip":       {"min": 30,  "max": 170, "label": "Hip Flexion"},
    "right_hip":      {"min": 30,  "max": 170, "label": "Hip Flexion"},
    "left_knee":      {"min": 10,  "max": 170, "label": "Knee Flexion"},
    "right_knee":     {"min": 10,  "max": 170, "label": "Knee Flexion"},
}


def calc_angle(a, b, c):
    ba = np.array([a.x - b.x, a.y - b.y, a.z - b.z])
    bc = np.array([c.x - b.x, c.y - b.y, c.z - b.z])
    cos_val = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    return round(math.degrees(math.acos(np.clip(cos_val, -1, 1))), 1)


JOINT_LANDMARK_MAP = {
    "left_elbow": 13, "right_elbow": 14,
    "left_shoulder": 11, "right_shoulder": 12,
    "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26,
    "left_ankle": 27, "right_ankle": 28,
}


def analyze_image(img_b64, landmarker, error_joints=None):
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

    err_set = set(error_joints) if error_joints else set()

    for angle_name, a_idx, b_idx, c_idx in ANGLE_DEFS:
        if angle_name in angles and b_idx < len(pose_lms):
            px = int(pose_lms[b_idx].x * w)
            py = int(pose_lms[b_idx].y * h)
            is_error = angle_name in err_set
            text_color = (0, 0, 255) if is_error else (255, 255, 255)

            if is_error:
                cv2.circle(img, (px, py), 14, (0, 0, 255), 3, cv2.LINE_AA)
                tri_pts = np.array([
                    [px - 7, py - 20],
                    [px + 7, py - 20],
                    [px, py - 30],
                ], np.int32)
                cv2.fillPoly(img, [tri_pts], (0, 0, 255))
                cv2.putText(img, "!", (px - 3, py - 21),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1, cv2.LINE_AA)

            cv2.putText(img, f"{angles[angle_name]:.0f}", (px + 8, py - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, text_color, 1, cv2.LINE_AA)
            cv2.putText(img, f"{angles[angle_name]:.0f}", (px + 7, py - 9),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 2, cv2.LINE_AA)
            cv2.putText(img, f"{angles[angle_name]:.0f}", (px + 8, py - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, text_color, 1, cv2.LINE_AA)

    _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buf).decode('utf-8')

    return {
        "detected": True,
        "landmarks": landmarks,
        "angles": angles,
        "symmetry": symmetry,
        "annotated_image": annotated_b64,
        "error_joints": list(err_set) if err_set else []
    }


def compute_motion_analysis(per_frame_results):
    detected_frames = [
        (i, r) for i, r in enumerate(per_frame_results)
        if r.get("detected") and r.get("angles")
    ]

    if len(detected_frames) < 2:
        return None

    all_joints = set()
    for _, r in detected_frames:
        all_joints.update(r["angles"].keys())

    angle_timelines = {}
    for joint in all_joints:
        timeline = []
        for frame_idx, r in detected_frames:
            if joint in r["angles"]:
                timeline.append({"frame": frame_idx + 1, "angle": r["angles"][joint]})
        if len(timeline) >= 2:
            angle_timelines[joint] = timeline

    deltas = {}
    for joint, timeline in angle_timelines.items():
        frame_deltas = []
        for k in range(1, len(timeline)):
            prev = timeline[k - 1]
            curr = timeline[k]
            delta = round(curr["angle"] - prev["angle"], 1)
            frame_deltas.append({
                "from_frame": prev["frame"],
                "to_frame": curr["frame"],
                "from_angle": prev["angle"],
                "to_angle": curr["angle"],
                "delta": delta,
                "direction": "flexing" if delta < -5 else "extending" if delta > 5 else "stable"
            })
        deltas[joint] = frame_deltas

    rom = {}
    for joint, timeline in angle_timelines.items():
        angles_list = [t["angle"] for t in timeline]
        min_a = min(angles_list)
        max_a = max(angles_list)
        measured_rom = round(max_a - min_a, 1)

        entry = {
            "min_angle": min_a,
            "max_angle": max_a,
            "range": measured_rom,
            "min_frame": timeline[angles_list.index(min_a)]["frame"],
            "max_frame": timeline[angles_list.index(max_a)]["frame"],
        }

        if joint in ROM_REFERENCE:
            ref = ROM_REFERENCE[joint]
            entry["reference_label"] = ref["label"]
            entry["reference_min"] = ref["min"]
            entry["reference_max"] = ref["max"]
            if min_a < ref["min"] - 10:
                entry["flag"] = "below_minimum"
                entry["flag_detail"] = f"Reached {min_a}° (reference min: {ref['min']}°)"
            elif max_a > ref["max"] + 10:
                entry["flag"] = "above_maximum"
                entry["flag_detail"] = f"Reached {max_a}° (reference max: {ref['max']}°)"
            elif measured_rom < 30:
                entry["flag"] = "limited_rom"
                entry["flag_detail"] = f"Only {measured_rom}° ROM across frames"
            else:
                entry["flag"] = "normal"

        rom[joint] = entry

    asymmetries = []
    for left_joint, right_joint in SYMMETRY_PAIRS:
        if left_joint in angle_timelines and right_joint in angle_timelines:
            left_angles = [t["angle"] for t in angle_timelines[left_joint]]
            right_angles = [t["angle"] for t in angle_timelines[right_joint]]
            min_len = min(len(left_angles), len(right_angles))

            frame_diffs = []
            for k in range(min_len):
                diff = round(abs(left_angles[k] - right_angles[k]), 1)
                frame_diffs.append(diff)

            avg_diff = round(sum(frame_diffs) / len(frame_diffs), 1)
            max_diff = max(frame_diffs)
            max_diff_frame = frame_diffs.index(max_diff)

            label = left_joint.replace("left_", "").replace("_", " ").title()
            asymmetries.append({
                "joint": label,
                "left_joint": left_joint,
                "right_joint": right_joint,
                "avg_difference": avg_diff,
                "max_difference": max_diff,
                "max_diff_frame": detected_frames[min(max_diff_frame, len(detected_frames) - 1)][0] + 1,
                "severity": "significant" if avg_diff > 15 else "moderate" if avg_diff > 8 else "minor",
                "flagged": avg_diff > 8,
            })

    phases = detect_movement_phases(detected_frames, angle_timelines, deltas)

    return {
        "frame_count": len(detected_frames),
        "total_frames": len(per_frame_results),
        "tracked_joints": list(angle_timelines.keys()),
        "deltas": deltas,
        "range_of_motion": rom,
        "asymmetries": asymmetries,
        "phases": phases,
    }


def detect_movement_phases(detected_frames, angle_timelines, deltas):
    if len(detected_frames) < 3:
        return []

    key_joints = ["left_knee", "right_knee", "left_hip", "right_hip",
                  "left_elbow", "right_elbow", "left_shoulder", "right_shoulder"]
    available_joints = [j for j in key_joints if j in deltas]

    if not available_joints:
        return []

    num_frames = len(detected_frames)
    frame_motion_scores = [0.0] * num_frames

    for joint in available_joints:
        for d in deltas[joint]:
            to_idx = None
            for idx, (fi, _) in enumerate(detected_frames):
                if fi + 1 == d["to_frame"]:
                    to_idx = idx
                    break
            if to_idx is not None:
                frame_motion_scores[to_idx] += abs(d["delta"])

    phases = []

    for i in range(num_frames):
        score = frame_motion_scores[i]
        frame_num = detected_frames[i][0] + 1

        joint_states = {}
        for joint in available_joints:
            for d in deltas[joint]:
                if d["to_frame"] == frame_num:
                    joint_states[joint] = d["direction"]

        flexing_count = sum(1 for v in joint_states.values() if v == "flexing")
        extending_count = sum(1 for v in joint_states.values() if v == "extending")
        stable_count = sum(1 for v in joint_states.values() if v == "stable")

        if score < 10:
            phase_type = "setup"
            phase_label = "Setup / Hold"
        elif flexing_count > extending_count:
            phase_type = "loading"
            phase_label = "Loading / Coiling"
        elif extending_count > flexing_count:
            phase_type = "drive"
            phase_label = "Drive / Extension"
        elif stable_count >= len(joint_states) * 0.7:
            phase_type = "hold"
            phase_label = "Hold / Follow-through"
        else:
            phase_type = "transition"
            phase_label = "Transition"

        phases.append({
            "frame": frame_num,
            "phase_type": phase_type,
            "phase_label": phase_label,
            "motion_score": round(score, 1),
            "dominant_joints": {k: v for k, v in joint_states.items() if v != "stable"},
        })

    return phases


def find_error_joints(motion_analysis):
    if not motion_analysis or motion_analysis.get("error"):
        return set()

    error_joints = set()

    asymmetries = motion_analysis.get("asymmetries", [])
    for a in asymmetries:
        if a.get("flagged"):
            error_joints.add(a.get("left_joint", ""))
            error_joints.add(a.get("right_joint", ""))

    rom = motion_analysis.get("range_of_motion", {})
    for joint, r in rom.items():
        if r.get("flag") and r["flag"] != "normal":
            error_joints.add(joint)

    error_joints.discard("")
    return error_joints


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

    clean_images = []
    for img_b64 in images:
        if img_b64.startswith("data:"):
            img_b64 = img_b64.split(",", 1)[1]
        clean_images.append(img_b64)

    results = []
    with landmarker:
        for img_b64 in clean_images:
            try:
                r = analyze_image(img_b64, landmarker)
                results.append(r)
            except Exception as e:
                results.append({"detected": False, "error": str(e)})

    motion_analysis = None
    if len(results) >= 2:
        try:
            motion_analysis = compute_motion_analysis(results)
        except Exception as e:
            motion_analysis = {"error": str(e)}

    err_joints = find_error_joints(motion_analysis)

    if err_joints:
        with vision.PoseLandmarker.create_from_options(options) as landmarker2:
            for i, img_b64 in enumerate(clean_images):
                if results[i].get("detected"):
                    try:
                        r2 = analyze_image(img_b64, landmarker2, error_joints=list(err_joints))
                        results[i]["annotated_image"] = r2.get("annotated_image", results[i].get("annotated_image"))
                        results[i]["error_joints"] = list(err_joints)
                    except Exception:
                        pass

    output = json.dumps({
        "results": results,
        "motion_analysis": motion_analysis
    })
    sys.stdout.write(output)
    sys.stdout.flush()


if __name__ == "__main__":
    main()
