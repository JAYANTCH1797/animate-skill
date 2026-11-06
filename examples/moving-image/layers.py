"""Cut the still image into separately movable layers: sky, tree, train and everything else.
Needs: pip install opencv-python-headless
"""
import cv2
import numpy as np

W, H = 1080, 1924  # the 735x1309 source scaled to video width; the render crops 2px off top and bottom
K = W / 735
VANISH = (830 * K, 800 * K)  # where the rails and roof line converge: scaling here slides the train along its own track


def orig(points):
    return (np.array(points, dtype=np.float32) * K).astype(np.int32)


def crop(points):
    """Points measured on the 2x train close-up (top-left at y=580 of the source)."""
    return orig([(x / 2, 580 + y / 2) for x, y in points])


TRAIN = crop([
    (283, 262), (290, 240), (320, 218), (370, 205), (480, 198), (482, 178), (535, 168), (640, 170), (690, 198), (760, 205),
    (820, 232), (930, 232), (1040, 245), (1060, 275), (1150, 285), (1240, 305), (1262, 325), (1304, 348), (1308, 500), (1280, 530),
    (1250, 558), (1060, 585), (960, 620), (800, 650), (700, 662), (620, 660), (590, 655), (310, 655), (308, 605), (272, 603),
    (270, 580), (300, 570), (283, 540),
])
PANTOGRAPHS = [
    crop([(600, 25), (840, 25), (840, 50), (830, 240), (680, 240), (660, 60), (600, 60)]),
    crop([(1095, 190), (1215, 190), (1215, 215), (1215, 330), (1120, 330), (1095, 215)]),
]
# Top edge of the hills: only what lies above this line can be sky.
RIDGE = orig([(0, 575), (60, 590), (120, 603), (190, 618), (235, 640), (300, 640), (400, 628), (520, 600), (590, 578), (640, 560), (680, 568), (735, 592)])
# Stone path and bench never sway with the grass.
PATH = orig([(415, 1030), (560, 975), (735, 975), (735, 1309), (530, 1309), (470, 1190)])
BENCH = orig([(548, 880), (695, 880), (695, 1075), (548, 1075)])
TREE_ZONE = orig([(0, 0), (620, 0), (620, 200), (540, 480), (340, 520), (240, 600), (120, 700), (0, 700)])


def fill(image, mask, shrink=3, radius=4):
    """Paint over `mask` from its surroundings. Done small because the regions are big and mostly stay hidden."""
    small = cv2.resize(image, None, fx=1 / shrink, fy=1 / shrink, interpolation=cv2.INTER_AREA)
    small_mask = cv2.resize(mask, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST)
    small_mask = cv2.dilate(small_mask, np.ones((3, 3), np.uint8))
    painted = cv2.inpaint(small, small_mask, radius, cv2.INPAINT_TELEA)
    painted = cv2.resize(painted, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_CUBIC)
    soft = cv2.GaussianBlur(mask, (0, 0), 1.2).astype(np.float32)[..., None] / 255
    return (image * (1 - soft) + painted * soft).astype(np.uint8)


def polygon(points):
    mask = np.zeros((H, W), np.uint8)
    cv2.fillPoly(mask, [points], 255)
    return mask


def below_ridge():
    xs = np.arange(W)
    ridge_y = np.interp(xs, RIDGE[:, 0], RIDGE[:, 1])
    return (np.arange(H)[:, None] >= ridge_y[None, :]).astype(np.uint8) * 255


def load():
    src = cv2.imread("source.webp")
    image = cv2.resize(src, (W, H), interpolation=cv2.INTER_LANCZOS4)
    soft = cv2.GaussianBlur(image, (0, 0), 1.4)
    return cv2.addWeighted(image, 1.45, soft, -0.45, 0)  # recover some crispness lost in the upscale


def train_mask(image):
    outline = polygon(TRAIN)
    cut = np.full((H, W), cv2.GC_BGD, np.uint8)
    cut[cv2.dilate(outline, np.ones((17, 17), np.uint8)) > 0] = cv2.GC_PR_BGD
    cut[outline > 0] = cv2.GC_PR_FGD
    cut[cv2.erode(outline, np.ones((21, 21), np.uint8)) > 0] = cv2.GC_FGD
    cv2.grabCut(image, cut, None, np.zeros((1, 65)), np.zeros((1, 65)), 3, cv2.GC_INIT_WITH_MASK)
    body = np.where((cut == cv2.GC_FGD) | (cut == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    # Pantograph frames are thin dark struts: thinness keeps the hills behind them out of the cutout.
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    thin = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    struts = np.zeros_like(body)
    for zone in PANTOGRAPHS:
        struts |= ((thin > 28) & (gray < 110) & (polygon(zone) > 0)).astype(np.uint8) * 255
    return body, cv2.dilate(struts, np.ones((3, 3), np.uint8))


def tree_mask(image):
    b, g, r = [c.astype(np.int32) for c in cv2.split(image)]
    pink = (r - g > 12) & (r - b > -6) & (r > 110)
    bark = (r - b > 6) & (r + g + b < 330)
    mask = ((pink | bark) & (polygon(TREE_ZONE) > 0)).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    return mask


def wires_mask(image, tree):
    """Thin, truly dark lines in open sky. Staying clear of the tree stops gaps between blossoms reading as wires."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    thin = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    clear = cv2.dilate(tree, np.ones((15, 15), np.uint8)) == 0
    return ((thin > 24) & (gray < 150) & clear).astype(np.uint8) * 255


def loose_petals(image):
    """Petals painted into the sky. They come out so they don't hang frozen while the animated ones fall."""
    b, g, r = [c.astype(np.int32) for c in cv2.split(image)]
    return cv2.dilate(((r - b > 4) & (r - g > 6)).astype(np.uint8) * 255, np.ones((5, 5), np.uint8))


def clone_behind_rear(plate, image, train):
    """The rear of the train uncovers a sliver of scenery; borrow it from just beyond the train, not from a blur."""
    x0, x1, shift = 900, 972, 92
    patch = np.roll(image, -shift, axis=1)[:, x0:x1]
    soft = cv2.GaussianBlur(cv2.dilate(train, np.ones((9, 9), np.uint8))[:, x0:x1], (0, 0), 2).astype(np.float32) / 255
    soft *= np.clip(np.minimum(np.arange(x1 - x0) / 14, (x1 - x0 - 1 - np.arange(x1 - x0)) / 12), 0, 1)[None, :]
    plate[:, x0:x1] = (plate[:, x0:x1] * (1 - soft[..., None]) + patch * soft[..., None]).astype(np.uint8)


def shade_under_train(plate):
    """What the moving train uncovers along its underside should read as its own shadow, not as a smear."""
    xs = np.arange(W, dtype=np.float32)
    middle = (850 - 0.08 * (xs / K - 140)) * K  # a line through the lower body
    lower = np.arange(H, dtype=np.float32)[:, None] > middle[None, :]
    zone = (cv2.dilate(polygon(TRAIN), np.ones((11, 11), np.uint8)) > 0) & lower
    soft = cv2.GaussianBlur(zone.astype(np.float32), (0, 0), 3)
    soft *= np.clip((930 - xs) / 30, 0, 1)[None, :]  # the rear keeps its cloned track, not a shadow
    soft = soft[..., None]
    plate[:] = (plate * (1 - 0.72 * soft)).astype(np.uint8)


def build():
    image = load()
    body, struts = train_mask(image)
    train = body | struts
    tree = tree_mask(image)
    ground = below_ridge()
    wires = wires_mask(image, tree) & ~ground

    # Background with the tree and train painted out, so nothing is missing when they move.
    plate = fill(image, cv2.dilate(tree | train, np.ones((5, 5), np.uint8)))
    clone_behind_rear(plate, image, train)
    shade_under_train(plate)

    # Clouds on their own: everything that is not open sky gets painted out.
    not_sky = cv2.dilate(ground | tree | wires | train, np.ones((9, 9), np.uint8)) | (loose_petals(image) & ~ground)
    clouds = fill(image, not_sky, shrink=4, radius=6)

    # Land, poles and wires, transparent wherever sky shows.
    land = cv2.GaussianBlur(ground | wires, (0, 0), 0.8)

    def rgba(colour, alpha):
        return np.dstack([colour, cv2.GaussianBlur(alpha, (0, 0), 0.7)])

    return {
        "clouds": clouds,
        "land": np.dstack([plate, land]),
        "train": rgba(image, train),
        "tree": rgba(image, tree),
        "image": image,
    }
