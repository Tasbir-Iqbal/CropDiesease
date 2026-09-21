
from ultralytics import YOLO
import matplotlib.pyplot as plt
import cv2

# ---------------- TRAINING ----------------
model = YOLO("yolo11n-cls.pt")

train_results = model.train(
    data="F:/Project/dataset",
    epochs=5,
    imgsz=224,
    
)

 #Get the exact path to best weights from this training run
best_weights = train_results.save_dir / "weights" / "best.pt"
print(f"Best weights saved at: {best_weights}")

model = YOLO(best_weights)  # load the model we just trained

img_path = "F:/Project/Rice_Blast.jpg"

results = model(img_path)
result = results[0]

 #Top prediction
top1_idx = result.probs.top1
top1_conf = result.probs.top1conf.item()
class_name = result.names[top1_idx]

print(f"\nPredicted class: {class_name}")
print(f"Confidence: {top1_conf:.4f}")

#Top-5 predictions
print("\nTop 5 predictions:")
top5_idx = result.probs.top5
top5_conf = result.probs.top5conf.tolist()
for idx, conf in zip(top5_idx, top5_conf):
    print(f"  {result.names[idx]}: {conf:.4f}")

# Show the image with predicted label
img = cv2.imread(img_path)
img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

plt.figure(figsize=(6, 6))
plt.imshow(img)
plt.title(f"{class_name} ({top1_conf*100:.2f}%)")
plt.axis("off")
plt.show()