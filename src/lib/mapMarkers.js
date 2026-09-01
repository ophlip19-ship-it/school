import { colorForKey } from './childTrips';

export function createChildPinEl({
  name,
  photoUrl,
  color,
  focused = false,
  live = false,
}) {
  const size = focused ? 42 : 32;
  const el = document.createElement('button');
  el.type = 'button';
  el.className = live ? 'schoolrun-child-pin schoolrun-child-pin-live' : 'schoolrun-child-pin';
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    'border-radius:9999px',
    `border:3px solid ${color || colorForKey(name)}`,
    'background:#fff',
    'padding:0',
    'overflow:hidden',
    'cursor:pointer',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    `font-weight:700`,
    `font-size:${focused ? 15 : 12}px`,
    `color:${color || colorForKey(name)}`,
    'box-shadow:0 2px 8px rgba(15,23,42,0.28)',
    focused ? 'z-index:2' : 'z-index:1',
  ].join(';');

  if (photoUrl) {
    const img = document.createElement('img');
    img.src = photoUrl;
    img.alt = name || 'Child';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;pointer-events:none';
    el.appendChild(img);
  } else {
    el.textContent = (name || '?').charAt(0).toUpperCase();
  }

  el.title = live ? `${name || 'Child'} · live` : name || 'Child';
  return el;
}

export function createCarPinEl() {
  const el = document.createElement('div');
  el.textContent = '🚗';
  el.style.cssText =
    'font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));';
  return el;
}
