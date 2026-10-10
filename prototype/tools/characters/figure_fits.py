"""How each supplied figure is fitted: read off the figures by eye and by measurement.

Joints are in the supplied file's own units (the figure stands one unit tall, y up, facing +z, its left at +x).
`remove` takes out what the figure holds. `regions` paint the figure once it stands naturally (metres, y up,
facing +z, hips at 0.96), first rule first; anything no rule takes is the top.
"""

TARGET_HEIGHT = {'f': 1.66, 'm': 1.77}      # top of the head, metres, before hair and hats

# The usual way round a head: hands are skin, loose strands are hair, the face is skin, the rest of the head is hair.
def head_rules(face_top=0.10, back_top=-0.02, face_half=0.078, hair_from=-0.09, ears=True):
    rules = [
        {'region': 'skin', 'bones': ['Hand'], 'tight': 0.07},
        {'region': 'hair', 'small_pieces': 300, 'near_head': 0.45},
        {'region': 'skin', 'bones': ['Head'], 'skull': [face_top, back_top, face_half], 'above_head': -0.16},
        {'region': 'skin', 'bones': ['Neck', 'Head'], 'tight': 0.065, 'below_head': 0.0},
    ]
    if ears: rules.append({'region': 'skin', 'bones': ['Head'], 'ears': True})
    rules.append({'region': 'hair', 'bones': ['Head'], 'above_head': hair_from})
    return rules


FITS = {
    'F1': {
        'file': 'fashionable_woman.glb', 'gender': 'f',
        'joints': {
            'pelvis': [0.0, 0.50, -0.04], 'spine': [0.0, 0.56, -0.045], 'chest': [0.005, 0.69, -0.07], 'neck': [0.005, 0.845, -0.07], 'head': [0.005, 0.89, -0.05], 'top': [0.005, 1.0, -0.035],
            'shoulder_L': [0.10, 0.81, -0.075], 'elbow_L': [0.135, 0.66, 0.0], 'wrist_L': [0.115, 0.575, 0.11], 'hand_L': [0.105, 0.535, 0.16],
            'shoulder_R': [-0.10, 0.81, -0.075], 'elbow_R': [-0.145, 0.67, -0.09], 'wrist_R': [-0.13, 0.55, -0.06], 'hand_R': [-0.13, 0.50, -0.04],
            'hip_L': [0.05, 0.49, -0.04], 'knee_L': [0.045, 0.28, -0.14], 'ankle_L': [0.03, 0.07, -0.22], 'toe_L': [0.02, 0.02, -0.12],
            'hip_R': [-0.05, 0.49, -0.03], 'knee_R': [-0.035, 0.29, 0.04], 'ankle_R': [-0.035, 0.085, 0.14], 'toe_R': [-0.02, 0.10, 0.25],
        },
        'remove': [{'box': [-0.2, -0.08, 0.3, 0.6, -0.15, 0.1], 'how': 'pieces'}],
        # she wears a hood: what is round the head and not her face or her hair is the jacket
        'regions': head_rules()[:-1] + [
            {'region': 'top', 'bones': ['Head', 'Neck']},
            {'region': 'shoes', 'bones': ['Foot', 'Toe'], 'below': 0.16},
            {'region': 'bottom', 'below': 0.95},
        ],
    },
    'F2': {
        'file': 'fashion_model.glb', 'gender': 'f', 'yaw': 63, 'head_yaw': 40, 'face_yaw': 35,
        'joints': {
            'pelvis': [0.0, 0.50, 0.02], 'spine': [0.0, 0.56, 0.02], 'chest': [0.0, 0.70, 0.03], 'neck': [0.0, 0.84, 0.035], 'head': [0.01, 0.885, 0.04], 'top': [0.0, 1.0, 0.03],
            'shoulder_L': [0.10, 0.815, 0.02], 'elbow_L': [0.14, 0.64, 0.0], 'wrist_L': [0.165, 0.49, -0.02], 'hand_L': [0.17, 0.44, -0.02],
            'shoulder_R': [-0.10, 0.815, 0.02], 'elbow_R': [-0.155, 0.64, 0.04], 'wrist_R': [-0.195, 0.50, 0.09], 'hand_R': [-0.205, 0.44, 0.11],
            'hip_L': [0.05, 0.49, 0.03], 'knee_L': [0.02, 0.29, 0.15], 'ankle_L': [0.012, 0.09, 0.15], 'toe_L': [0.02, 0.02, 0.24],
            'hip_R': [-0.05, 0.49, 0.0], 'knee_R': [-0.03, 0.28, -0.05], 'ankle_R': [-0.02, 0.12, -0.20], 'toe_R': [-0.01, 0.01, -0.15],
        },
        'remove': [],
        'regions': head_rules() + [
            {'region': 'shoes', 'bones': ['Shin', 'Foot', 'Toe'], 'tight': 0.09},
            {'region': 'shoes', 'below': 0.12, 'within': 0.2},
        ],
    },
    'F3': {
        'file': 'fashion_model2.glb', 'gender': 'f',
        'joints': {
            'pelvis': [0.005, 0.51, 0.0], 'spine': [0.0, 0.57, 0.0], 'chest': [0.0, 0.70, 0.01], 'neck': [0.0, 0.845, 0.0], 'head': [0.0, 0.89, 0.01], 'top': [0.0, 1.0, 0.0],
            'shoulder_L': [0.10, 0.815, -0.01], 'elbow_L': [0.15, 0.70, 0.0], 'wrist_L': [0.08, 0.79, 0.09], 'hand_L': [0.05, 0.84, 0.10],
            'shoulder_R': [-0.10, 0.815, -0.01], 'elbow_R': [-0.15, 0.68, -0.08], 'wrist_R': [-0.12, 0.58, -0.02], 'hand_R': [-0.11, 0.54, 0.03],
            'hip_L': [0.06, 0.50, 0.01], 'knee_L': [0.063, 0.28, 0.10], 'ankle_L': [0.035, 0.07, 0.16], 'toe_L': [0.05, 0.02, 0.24],
            'hip_R': [-0.05, 0.50, -0.02], 'knee_R': [0.0, 0.28, -0.09], 'ankle_R': [0.03, 0.09, -0.21], 'toe_R': [0.015, 0.02, -0.15],
        },
        'remove': [],
        'regions': head_rules() + [{'region': 'shoes', 'bones': ['Foot', 'Toe'], 'below': 0.16}, {'region': 'bottom', 'below': 0.93}],
    },
    'F4': {
        'file': 'gray_dress.glb', 'gender': 'f', 'yaw': 135, 'head_yaw': 0, 'face_yaw': 90,
        'joints': {
            'pelvis': [0.0, 0.50, -0.04], 'spine': [0.0, 0.56, -0.04], 'chest': [0.0, 0.69, -0.04], 'neck': [0.0, 0.84, -0.04], 'head': [0.0, 0.885, -0.03], 'top': [0.0, 1.0, -0.03],
            'shoulder_L': [0.09, 0.81, -0.05], 'elbow_L': [0.12, 0.66, -0.03], 'wrist_L': [0.14, 0.52, 0.0], 'hand_L': [0.15, 0.47, 0.01],
            'shoulder_R': [-0.09, 0.81, -0.05], 'elbow_R': [-0.08, 0.66, 0.05], 'wrist_R': [0.03, 0.79, 0.12], 'hand_R': [0.07, 0.83, 0.13],
            'hip_L': [0.05, 0.50, -0.04], 'knee_L': [0.07, 0.30, -0.065], 'ankle_L': [0.10, 0.10, -0.07], 'toe_L': [0.105, 0.01, 0.03],
            'hip_R': [-0.05, 0.50, -0.04], 'knee_R': [-0.09, 0.30, -0.04], 'ankle_R': [-0.10, 0.10, -0.07], 'toe_R': [-0.09, 0.01, 0.02],
        },
        'remove': [{'box': [-0.02, 0.16, 0.62, 0.92, 0.04, 0.2], 'how': 'pieces'}],
        'regions': head_rules() + [{'region': 'hair', 'near_head': 0.19, 'far': 0.05}, {'region': 'shoes', 'below': 0.09}, {'region': 'skin', 'bones': ['Thigh', 'Shin'], 'below': 0.75, 'tight': 0.1}],
    },
    'F5': {
        # seated, legs crossed, a bag on her lap under her right hand and her left hand at her face
        'file': 'fashion_model3.glb', 'gender': 'f', 'yaw': 26, 'keep_arms': ('L', 'R'), 'trim_stretched': 2.2,
        'joints': {
            'pelvis': [0.0, 0.29, -0.30], 'spine': [0.0, 0.36, -0.31], 'chest': [0.0, 0.56, -0.31], 'neck': [-0.01, 0.77, -0.31], 'head': [-0.02, 0.83, -0.31], 'top': [-0.03, 0.96, -0.34],
            'shoulder_L': [0.14, 0.75, -0.30], 'elbow_L': [0.21, 0.60, -0.26], 'wrist_L': [0.19, 0.79, -0.26], 'hand_L': [0.15, 0.85, -0.27],
            'shoulder_R': [-0.14, 0.75, -0.30], 'elbow_R': [-0.20, 0.57, -0.25], 'wrist_R': [-0.10, 0.60, -0.12], 'hand_R': [0.0, 0.625, -0.06],
            'hip_L': [0.07, 0.29, -0.28], 'knee_L': [0.03, 0.47, 0.12], 'ankle_L': [0.04, 0.11, 0.21], 'toe_L': [0.05, 0.03, 0.33],
            'hip_R': [-0.07, 0.29, -0.28], 'knee_R': [-0.12, 0.40, 0.04], 'ankle_R': [-0.10, 0.12, 0.40], 'toe_R': [-0.10, 0.06, 0.53],
        },
        'remove': [{'box': [-0.105, 0.16, 0.50, 0.615, -0.115, 0.025]}],
        'regions': head_rules() + [{'region': 'hair', 'bones': ['Chest', 'Spine', 'Neck', 'Clavicle'], 'behind': -0.12, 'above': 1.25, 'within': 0.16},
                                   {'region': 'shoes', 'bones': ['Shin', 'Foot', 'Toe'], 'tight': 0.09}],
    },
    'F6': {
        'file': 'female_character.glb', 'gender': 'f', 'keep_arms': ('L', 'R'),
        'joints': {
            'pelvis': [0.0, 0.50, -0.01], 'spine': [0.0, 0.56, -0.02], 'chest': [0.0, 0.70, -0.01], 'neck': [0.0, 0.845, -0.03], 'head': [0.0, 0.89, -0.02], 'top': [0.0, 1.0, -0.03],
            'shoulder_L': [0.10, 0.815, -0.03], 'elbow_L': [0.12, 0.70, -0.04], 'wrist_L': [0.07, 0.67, 0.08], 'hand_L': [0.03, 0.655, 0.12],
            'shoulder_R': [-0.10, 0.815, -0.03], 'elbow_R': [-0.12, 0.70, -0.04], 'wrist_R': [-0.05, 0.665, 0.07], 'hand_R': [0.01, 0.66, 0.11],
            'hip_L': [0.05, 0.49, -0.01], 'knee_L': [0.02, 0.27, -0.04], 'ankle_L': [0.0, 0.10, -0.09], 'toe_L': [-0.005, 0.01, -0.02],
            'hip_R': [-0.05, 0.49, 0.0], 'knee_R': [-0.03, 0.27, 0.03], 'ankle_R': [-0.01, 0.08, 0.01], 'toe_R': [-0.01, 0.01, 0.08],
        },
        'remove': [],
        # her hair falls down her back over the dress
        'regions': head_rules() + [{'region': 'hair', 'bones': ['Chest', 'Spine', 'Neck', 'Clavicle'], 'behind': -0.105, 'above': 1.28, 'within': 0.15}, {'region': 'hair', 'near_head': 0.17, 'far': 0.06, 'above': 1.55}, {'region': 'shoes', 'below': 0.10}],
    },
}
