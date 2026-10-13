/**
 * The avatar field of the profile forms: the picture chosen is shown and cropped square with
 * Cropper.js, and on submit the crop goes into the hidden `avatar` field as a JPEG data URL
 * (512 px, well under the body limit). The server re-encodes it; this script decides nothing.
 * The one script of our own in the admin: Cropper has no declarative form.
 */
document.addEventListener("DOMContentLoaded", () => {
  for (const form of document.querySelectorAll("form[data-avatar]")) {
    const file = form.querySelector("input[type=file]");
    const img = form.querySelector("img[data-crop]");
    const field = form.querySelector("input[name=avatar]");
    const stage = form.querySelector("[data-stage]");
    if (!file || !img || !field || !stage) continue;
    let cropper = null;
    file.addEventListener("change", () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      if (cropper) cropper.destroy();
      img.src = URL.createObjectURL(chosen);
      stage.hidden = false;
      cropper = new Cropper(img, { aspectRatio: 1, viewMode: 1, autoCropArea: 1, background: false });
    });
    form.addEventListener("submit", () => {
      if (!cropper) return;
      field.value = cropper.getCroppedCanvas({ width: 512, height: 512, imageSmoothingQuality: "high" }).toDataURL("image/jpeg", 0.9);
      file.value = "";
    });
  }
});
