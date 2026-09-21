/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   three-loader.js — loads Three.js and shares it as window.THREE

   Three.js only ships as ES modules now (no three.min.js since r160),
   while the site's scripts are plain scripts that expect a global
   THREE. This module bridges the two. The version is pinned by the
   import map in index.html.

   Module scripts run after the plain ones have loaded but before
   DOMContentLoaded, so nothing may touch THREE at load time — only
   inside functions that run later (city.js start(), overlays opening).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// The module namespace is read-only, so copy it and add the one addon we use
window.THREE = Object.assign({ RoomEnvironment }, THREE);
