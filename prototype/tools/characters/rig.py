"""The skeleton, and the pose the generated clothing is tailored in.

The base character is bound with its arms held out from a big hoodie and its
feet set wide in big shoes. Fitted clothes are cut for the same skeleton
standing naturally: arms hanging close with a forearm of ordinary length,
feet under the hips. That is the "natural" pose. It is a pose of the same 22
bones, so every animation serves both.

Clothing is drawn in the natural pose and then carried back to the bind pose
exactly, vertex by vertex, so that the skeleton standing naturally shows it
as drawn.
"""
import numpy as np
from glb import quat_to_mat

UPPER_ARM = 0.285          # shoulder to elbow, metres (0.239 as bound)
FOREARM = 0.235            # elbow to wrist (0.157 as bound)


def unit(v):
    v = np.asarray(v, dtype=float)
    return v / np.linalg.norm(v)


def mat_to_quat(R):
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2; w = 0.25 * s
        x = (R[2, 1] - R[1, 2]) / s; y = (R[0, 2] - R[2, 0]) / s; z = (R[1, 0] - R[0, 1]) / s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = np.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2]) * 2; w = (R[2, 1] - R[1, 2]) / s
        x = 0.25 * s; y = (R[0, 1] + R[1, 0]) / s; z = (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = np.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2]) * 2; w = (R[0, 2] - R[2, 0]) / s
        x = (R[0, 1] + R[1, 0]) / s; y = 0.25 * s; z = (R[1, 2] + R[2, 1]) / s
    else:
        s = np.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1]) * 2; w = (R[1, 0] - R[0, 1]) / s
        x = (R[0, 2] + R[2, 0]) / s; y = (R[1, 2] + R[2, 1]) / s; z = 0.25 * s
    q = np.array([x, y, z, w]); return q / np.linalg.norm(q)


def rotation_between(a, b):
    """The smallest rotation that turns direction a onto direction b."""
    a = unit(a); b = unit(b)
    v = np.cross(a, b); c = float(a @ b); s = np.linalg.norm(v)
    if s < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * ((1 - c) / (s * s))


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


class Rig:
    def __init__(self, bones):
        self.bones = bones
        self.names = [b['name'] for b in bones]
        self.index = {n: i for i, n in enumerate(self.names)}
        self.n = len(bones)
        self.bind = np.array([b['world'] for b in bones])              # world matrices as bound
        self.ibm = np.array([b['ibm'] for b in bones])
        self.natural = self._natural()
        self.skin = np.einsum('bij,bjk->bik', self.natural['world'], self.ibm)   # bind space -> natural pose, per bone

    def _natural(self):
        """World matrices, and local translation and rotation, of each bone in the natural pose."""
        W = self.bind.copy()
        I = self.index

        def aim(name, head, direction, yaw=0.0):
            i = I[name]
            R0 = self.bind[i][:3, :3]
            R = rotation_between(R0[:, 1], direction) @ R0
            if yaw: R = rot_y(yaw) @ R
            W[i] = np.eye(4); W[i][:3, :3] = R; W[i][:3, 3] = head
            return head + 0  # copy

        for s, sign in (('L', 1), ('R', -1)):
            shoulder = self.bind[I[f'UpperArm_{s}']][:3, 3]
            du = unit([0.105 * sign, -0.994, 0.012])
            aim(f'UpperArm_{s}', shoulder, du)
            elbow = shoulder + UPPER_ARM * du
            df = unit([0.115 * sign, -0.965, 0.23])
            aim(f'Forearm_{s}', elbow, df)
            wrist = elbow + FOREARM * df
            i = I[f'Hand_{s}']
            W[i] = self.bind[i].copy(); W[i][:3, 3] = wrist          # the hand hangs as it did
            hip = self.bind[I[f'Thigh_{s}']][:3, 3]
            dt = unit([0.012 * sign, -1.0, 0.03])
            aim(f'Thigh_{s}', hip, dt)
            knee = hip + np.linalg.norm(self.bind[I[f'Shin_{s}']][:3, 3] - hip) * dt
            ds = unit([0.010 * sign, -1.0, -0.03])
            aim(f'Shin_{s}', knee, ds)
            ankle = knee + np.linalg.norm(self.bind[I[f'Foot_{s}']][:3, 3] - self.bind[I[f'Shin_{s}']][:3, 3]) * ds
            i = I[f'Foot_{s}']
            foot_dir = self.bind[i][:3, 1]
            aim(f'Foot_{s}', ankle, foot_dir, yaw=0.10 * sign)
            j = I[f'Toe_{s}']
            rel = np.linalg.inv(self.bind[i]) @ self.bind[j]
            W[j] = W[i] @ rel
        local_t = []; local_q = []
        for i, b in enumerate(self.bones):
            L = W[i] if b['parent'] < 0 else np.linalg.inv(W[b['parent']]) @ W[i]
            R = L[:3, :3].copy()
            # bones carry no scale in this pose
            for k in range(3): R[:, k] /= np.linalg.norm(R[:, k])
            local_t.append(L[:3, 3]); local_q.append(mat_to_quat(R))
        return {'world': W, 't': np.array(local_t), 'q': np.array(local_q)}

    def joint(self, name, pose='natural'):
        W = self.natural['world'] if pose == 'natural' else self.bind
        return W[self.index[name]][:3, 3].copy()

    def axis(self, name, k=1, pose='natural'):
        W = self.natural['world'] if pose == 'natural' else self.bind
        return W[self.index[name]][:3, k].copy()

    def to_bind(self, mesh):
        """Carries a mesh drawn in the natural pose back to the bind pose."""
        P = mesh['pos']; N = mesh['nrm']
        M = np.zeros((len(P), 4, 4))
        for k in range(4): M += mesh['W'][:, k, None, None] * self.skin[mesh['J'][:, k]]
        Mi = np.linalg.inv(M)
        out = dict(mesh)
        out['pos'] = np.einsum('nij,nj->ni', Mi[:, :3, :3], P) + Mi[:, :3, 3]
        n = np.einsum('nij,nj->ni', Mi[:, :3, :3], N)
        out['nrm'] = n / np.maximum(np.linalg.norm(n, axis=1), 1e-20)[:, None]
        return out

    def to_natural(self, mesh):
        """Where a bind-pose mesh sits when the skeleton stands naturally."""
        P = mesh['pos']
        M = np.zeros((len(P), 4, 4))
        for k in range(4): M += mesh['W'][:, k, None, None] * self.skin[mesh['J'][:, k]]
        out = dict(mesh)
        out['pos'] = np.einsum('nij,nj->ni', M[:, :3, :3], P) + M[:, :3, 3]
        n = np.einsum('nij,nj->ni', M[:, :3, :3], mesh['nrm'])
        out['nrm'] = n / np.maximum(np.linalg.norm(n, axis=1), 1e-20)[:, None]
        return out

    def weights(self, **named):
        """A dense weight row from names: rig.weights(Chest=0.5, Spine=0.5)."""
        w = np.zeros(self.n)
        for name, v in named.items(): w[self.index[name]] = v
        return w / w.sum()
