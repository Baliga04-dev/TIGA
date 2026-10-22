// Two small jobs: show WhatsApp buttons when a number is set, and drive the before/after photo slider.
document.addEventListener("DOMContentLoaded", () => {
  const number = (window.SITE && window.SITE.whatsapp || "").replace(/\D/g, "");
  if (number) {
    const text = encodeURIComponent("Hi Adithya, I'd like to talk about a website for my shop.");
    document.querySelectorAll("[data-whatsapp]").forEach((a) => {
      a.href = `https://wa.me/${number}?text=${text}`;
      a.hidden = false;
    });
  }
  document.querySelectorAll(".compare").forEach((box) => {
    const range = box.querySelector(".compare-range");
    const update = () => box.style.setProperty("--cut", `${range.value}%`);
    range.addEventListener("input", update);
    update();
  });
});
