// The overlay window lets clicks pass through to the app underneath,
// except while the mouse is over the buttons.
const actions = document.getElementById('actions');
actions.addEventListener('mouseenter', () => window.h2o.setClickable(true));
actions.addEventListener('mouseleave', () => window.h2o.setClickable(false));

let leaving = false;
function leave(choice) {
  if (leaving) return;
  leaving = true;
  window.h2o.setClickable(false);
  window.h2o.choose(choice);
  document.getElementById('scene').classList.add('leaving');
  setTimeout(() => window.h2o.close(), 1600);
}
document.getElementById('drank').addEventListener('click', () => leave('drank'));
document.getElementById('later').addEventListener('click', () => leave('later'));

// Walk away on his own after a while if nobody clicks.
setTimeout(() => leave('timeout'), 90 * 1000);
