import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

(function () {
  'use strict';

  var container = document.getElementById('microscope-canvas');
  if (!container) return;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Camera further back so full microscope is visible
  var defaultCamPos = new THREE.Vector3(5.5, 4.5, 6.5);
  var defaultTarget = new THREE.Vector3(0, 2.0, 0);
  camera.position.copy(defaultCamPos);

  var controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(defaultTarget);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * 0.15;
  controls.maxPolarAngle = Math.PI * 0.7;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8;
  controls.update();

  // Lighting — more realistic with shadows
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  var keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(6, 10, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 25;
  keyLight.shadow.camera.left = -5;
  keyLight.shadow.camera.right = 5;
  keyLight.shadow.camera.top = 8;
  keyLight.shadow.camera.bottom = -2;
  keyLight.shadow.bias = -0.002;
  scene.add(keyLight);

  var fillLight = new THREE.DirectionalLight(0x9EC5C2, 0.5);
  fillLight.position.set(-4, 3, -3);
  scene.add(fillLight);

  var backLight = new THREE.DirectionalLight(0xE0F0EE, 0.6);
  backLight.position.set(-1, 6, 6);
  scene.add(backLight);

  // Environment reflection
  var envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0xD8ECEA);
  var pmrem = new THREE.PMREMGenerator(renderer);
  var envMap = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envMap;
  pmrem.dispose();

  // Materials — more realistic
  var whitePaint = new THREE.MeshStandardMaterial({
    color: 0xE4E8EA, roughness: 0.28, metalness: 0.08, envMapIntensity: 0.5
  });

  var darkPaint = new THREE.MeshStandardMaterial({
    color: 0x1E2528, roughness: 0.35, metalness: 0.25, envMapIntensity: 0.6
  });

  var chrome = new THREE.MeshStandardMaterial({
    color: 0xCCCCCC, roughness: 0.12, metalness: 0.85, envMapIntensity: 1.0
  });

  var tealPaint = new THREE.MeshStandardMaterial({
    color: 0x0E7C75, roughness: 0.25, metalness: 0.15, envMapIntensity: 0.5
  });

  var rubberMat = new THREE.MeshStandardMaterial({
    color: 0x2C3438, roughness: 0.75, metalness: 0.0
  });

  var glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xDDEEEC, roughness: 0.05, metalness: 0.0,
    transmission: 0.7, thickness: 0.4, transparent: true, opacity: 0.65,
    envMapIntensity: 0.8
  });

  var lensMat = new THREE.MeshPhysicalMaterial({
    color: 0xAADDFF, roughness: 0.02, metalness: 0.05,
    transmission: 0.5, thickness: 0.6, transparent: true, opacity: 0.85,
    envMapIntensity: 1.0
  });

  var microscope = new THREE.Group();

  // === BASE — heavy horseshoe shape ===
  var baseShape = new THREE.Shape();
  roundedRect(baseShape, -1.4, -0.8, 2.8, 1.6, 0.3);
  var baseGeo = new THREE.ExtrudeGeometry(baseShape, {
    depth: 0.4, bevelEnabled: true, bevelThickness: 0.06,
    bevelSize: 0.06, bevelSegments: 4
  });
  baseGeo.rotateX(-Math.PI / 2);
  var baseMesh = new THREE.Mesh(baseGeo, whitePaint);
  baseMesh.receiveShadow = true;
  baseMesh.castShadow = true;
  microscope.add(baseMesh);

  // Base rubber feet
  for (var fi = 0; fi < 4; fi++) {
    var footGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.04, 12);
    var foot = new THREE.Mesh(footGeo, rubberMat);
    foot.position.set(
      fi < 2 ? -1.0 : 1.0,
      -0.02,
      fi % 2 === 0 ? -0.5 : 0.5
    );
    microscope.add(foot);
  }

  // Teal accent line
  var accentGeo = new THREE.BoxGeometry(2.5, 0.04, 0.02);
  var accent = new THREE.Mesh(accentGeo, tealPaint);
  accent.position.set(0, 0.2, 0.82);
  microscope.add(accent);

  // === ARM — vertical pillar with slight taper ===
  var armPts = [];
  armPts.push(new THREE.Vector2(0.28, 0));
  armPts.push(new THREE.Vector2(0.26, 1.5));
  armPts.push(new THREE.Vector2(0.24, 3.0));
  armPts.push(new THREE.Vector2(0.22, 3.8));
  var armGeo = new THREE.LatheGeometry(armPts, 24, 0, Math.PI * 2);
  armGeo.scale(1, 1, 0.7);
  var armMesh = new THREE.Mesh(armGeo, whitePaint);
  armMesh.position.set(0, 0.4, -0.35);
  armMesh.castShadow = true;
  microscope.add(armMesh);

  // === HEAD — angled observation head ===
  var headGeo = new THREE.CylinderGeometry(0.22, 0.26, 1.0, 20);
  var headMesh = new THREE.Mesh(headGeo, whitePaint);
  headMesh.position.set(0, 4.2, -0.1);
  headMesh.rotation.z = -0.18;
  headMesh.castShadow = true;
  microscope.add(headMesh);

  // Joint ring
  var jointGeo = new THREE.TorusGeometry(0.26, 0.04, 12, 24);
  var joint = new THREE.Mesh(jointGeo, chrome);
  joint.position.set(0, 3.75, -0.1);
  joint.rotation.x = Math.PI / 2;
  microscope.add(joint);

  // === EYEPIECE TUBE — the clickable part ===
  var eyeGroup = new THREE.Group();
  eyeGroup.name = 'eyepiece';

  var eyeTubeGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.8, 24);
  var eyeTube = new THREE.Mesh(eyeTubeGeo, darkPaint);
  eyeTube.position.set(0, 0.4, 0);
  eyeTube.castShadow = true;
  eyeGroup.add(eyeTube);

  // Eyepiece rubber grip
  var gripGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.18, 24);
  var grip = new THREE.Mesh(gripGeo, rubberMat);
  grip.position.set(0, 0.72, 0);
  eyeGroup.add(grip);

  // Eyepiece top rim
  var topRimGeo = new THREE.CylinderGeometry(0.20, 0.19, 0.06, 24);
  var topRim = new THREE.Mesh(topRimGeo, tealPaint);
  topRim.position.set(0, 0.84, 0);
  eyeGroup.add(topRim);

  // Lens at top
  var topLensGeo = new THREE.CircleGeometry(0.15, 24);
  var topLens = new THREE.Mesh(topLensGeo, lensMat);
  topLens.position.set(0, 0.87, 0);
  topLens.rotation.x = -Math.PI / 2;
  eyeGroup.add(topLens);

  eyeGroup.position.set(0, 4.5, -0.1);
  eyeGroup.rotation.z = -0.18;
  microscope.add(eyeGroup);

  // Store all eyepiece meshes for raycasting
  var eyepieceMeshes = [];
  eyeGroup.traverse(function (child) {
    if (child.isMesh) eyepieceMeshes.push(child);
  });

  // === STAGE — rectangular platform ===
  var stageGeo = new THREE.BoxGeometry(1.8, 0.1, 1.5);
  stageGeo.translate(0, 0, 0);
  var stageMesh = new THREE.Mesh(stageGeo, darkPaint);
  stageMesh.position.set(0, 1.7, 0.1);
  stageMesh.receiveShadow = true;
  stageMesh.castShadow = true;
  microscope.add(stageMesh);

  // Stage aperture ring
  var apertureGeo = new THREE.RingGeometry(0.15, 0.35, 24);
  var apertureMat = new THREE.MeshStandardMaterial({
    color: 0x1A1E20, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide
  });
  var aperture = new THREE.Mesh(apertureGeo, apertureMat);
  aperture.position.set(0, 1.76, 0.1);
  aperture.rotation.x = -Math.PI / 2;
  microscope.add(aperture);

  // Stage clips (spring-loaded)
  for (var ci = 0; ci < 2; ci++) {
    var clipBase = new THREE.BoxGeometry(0.06, 0.04, 0.3);
    var clipMesh = new THREE.Mesh(clipBase, chrome);
    clipMesh.position.set(ci === 0 ? -0.55 : 0.55, 1.78, 0.25);
    microscope.add(clipMesh);

    var clipFinger = new THREE.BoxGeometry(0.08, 0.02, 0.08);
    var clipF = new THREE.Mesh(clipFinger, chrome);
    clipF.position.set(ci === 0 ? -0.55 : 0.55, 1.79, 0.1);
    microscope.add(clipF);
  }

  // === PETRI DISH on stage ===
  var petriGroup = new THREE.Group();
  petriGroup.position.set(0, 1.78, 0.1);

  var petriBaseGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 32);
  var petriBase = new THREE.Mesh(petriBaseGeo, glassMat);
  petriGroup.add(petriBase);

  var petriRimGeo = new THREE.TorusGeometry(0.42, 0.02, 8, 32);
  var petriRim = new THREE.Mesh(petriRimGeo, glassMat);
  petriRim.position.y = 0.03;
  petriGroup.add(petriRim);

  // Culture medium
  var medGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.025, 32);
  var medMat = new THREE.MeshStandardMaterial({
    color: 0x0A8A82, roughness: 0.15, metalness: 0.0,
    transparent: true, opacity: 0.45
  });
  var medium = new THREE.Mesh(medGeo, medMat);
  medium.position.y = 0.04;
  petriGroup.add(medium);

  microscope.add(petriGroup);

  // === NOSEPIECE (revolving turret) ===
  var noseGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.15, 8);
  var noseMesh = new THREE.Mesh(noseGeo, chrome);
  noseMesh.position.set(0, 1.52, 0.1);
  microscope.add(noseMesh);

  // Objectives — 3 lens tubes
  var objData = [
    { angle: -0.45, len: 0.35, r: 0.055, color: 0x0E7C75 },
    { angle: 0,     len: 0.50, r: 0.06,  color: 0xD4A843 },
    { angle: 0.45,  len: 0.28, r: 0.05,  color: 0xCD7F32 }
  ];
  objData.forEach(function (od) {
    var objTubeGeo = new THREE.CylinderGeometry(od.r, od.r * 0.9, od.len, 16);
    var objTube = new THREE.Mesh(objTubeGeo, darkPaint);
    objTube.position.set(
      Math.sin(od.angle) * 0.14,
      1.52 - od.len / 2 - 0.08,
      0.1 + Math.cos(od.angle) * 0.14
    );
    objTube.castShadow = true;
    microscope.add(objTube);

    // Color band
    var bandGeo = new THREE.CylinderGeometry(od.r + 0.008, od.r + 0.008, 0.04, 16);
    var bandMat = new THREE.MeshStandardMaterial({
      color: od.color, roughness: 0.25, metalness: 0.15
    });
    var band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(
      Math.sin(od.angle) * 0.14,
      1.52 - 0.12,
      0.1 + Math.cos(od.angle) * 0.14
    );
    microscope.add(band);
  });

  // === FOCUS KNOBS — coaxial ===
  for (var ki = 0; ki < 2; ki++) {
    var s = ki === 0 ? -1 : 1;

    // Coarse (large)
    var coarseGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 24);
    coarseGeo.rotateZ(Math.PI / 2);
    var coarseKnob = new THREE.Mesh(coarseGeo, rubberMat);
    coarseKnob.position.set(s * 0.38, 2.0, -0.35);
    microscope.add(coarseKnob);

    // Chrome ring
    var cRingGeo = new THREE.TorusGeometry(0.2, 0.015, 8, 20);
    cRingGeo.rotateY(Math.PI / 2);
    var cRing = new THREE.Mesh(cRingGeo, chrome);
    cRing.position.set(s * 0.38, 2.0, -0.35);
    microscope.add(cRing);

    // Fine (small, concentric)
    var fineGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.06, 24);
    fineGeo.rotateZ(Math.PI / 2);
    var fineKnob = new THREE.Mesh(fineGeo, tealPaint);
    fineKnob.position.set(s * 0.44, 2.0, -0.35);
    microscope.add(fineKnob);
  }

  // === CONDENSER / LIGHT ===
  var condGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.25, 16);
  var condenser = new THREE.Mesh(condGeo, darkPaint);
  condenser.position.set(0, 0.45, 0.1);
  condenser.castShadow = true;
  microscope.add(condenser);

  // Light glow
  var glowGeo = new THREE.CircleGeometry(0.1, 16);
  var glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x5BC4BC, transparent: true, opacity: 0.7
  });
  var glow = new THREE.Mesh(glowGeo, glowMaterial);
  glow.position.set(0, 0.58, 0.1);
  glow.rotation.x = -Math.PI / 2;
  microscope.add(glow);

  // Ground shadow plane
  var shadowGeo = new THREE.PlaneGeometry(6, 6);
  var shadowMat = new THREE.ShadowMaterial({ opacity: 0.08 });
  var shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -0.02;
  shadowPlane.receiveShadow = true;
  microscope.add(shadowPlane);

  // Position whole microscope
  microscope.position.y = -2.0;
  scene.add(microscope);

  // === CLICK TO ZOOM (eyepiece interaction) ===
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var zoomOverlay = document.getElementById('zoom-overlay');
  var isZoomed = false;

  var petriWorldPos = new THREE.Vector3();

  function getGsap() { return window.gsap; }

  function getPetriPos() {
    petriGroup.getWorldPosition(petriWorldPos);
    return petriWorldPos;
  }

  function zoomIn() {
    if (isZoomed) return;
    isZoomed = true;
    controls.autoRotate = false;
    controls.enabled = false;
    renderer.domElement.style.cursor = 'pointer';

    var gsap = getGsap();
    var target = getPetriPos();
    var camTo = { x: target.x + 0.6, y: target.y + 0.5, z: target.z + 0.8 };

    if (gsap) {
      gsap.to(camera.position, {
        x: camTo.x, y: camTo.y, z: camTo.z,
        duration: 1.4, ease: 'power2.inOut',
        onUpdate: function () { camera.lookAt(target); }
      });
      gsap.to(controls.target, {
        x: target.x, y: target.y, z: target.z,
        duration: 1.4, ease: 'power2.inOut'
      });
      gsap.delayedCall(1.0, function () {
        if (zoomOverlay) zoomOverlay.classList.add('visible');
      });
    } else {
      camera.position.set(camTo.x, camTo.y, camTo.z);
      camera.lookAt(target);
      if (zoomOverlay) zoomOverlay.classList.add('visible');
    }
  }

  function zoomOut() {
    if (!isZoomed) return;
    isZoomed = false;
    renderer.domElement.style.cursor = 'grab';
    if (zoomOverlay) zoomOverlay.classList.remove('visible');

    var gsap = getGsap();
    if (gsap) {
      gsap.to(camera.position, {
        x: defaultCamPos.x, y: defaultCamPos.y, z: defaultCamPos.z,
        duration: 1.2, ease: 'power2.inOut',
        onComplete: function () {
          controls.enabled = true;
          controls.autoRotate = true;
        }
      });
      gsap.to(controls.target, {
        x: defaultTarget.x, y: defaultTarget.y, z: defaultTarget.z,
        duration: 1.2, ease: 'power2.inOut'
      });
    } else {
      camera.position.copy(defaultCamPos);
      controls.target.copy(defaultTarget);
      controls.enabled = true;
      controls.autoRotate = true;
    }
  }

  var clickStart = new THREE.Vector2();

  renderer.domElement.addEventListener('pointerdown', function (e) {
    clickStart.set(e.clientX, e.clientY);
  });

  renderer.domElement.addEventListener('pointerup', function (e) {
    var dx = e.clientX - clickStart.x;
    var dy = e.clientY - clickStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > 6) return;

    if (isZoomed) {
      zoomOut();
      return;
    }

    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObjects(eyepieceMeshes, false);
    if (hits.length > 0) {
      zoomIn();
    }
  });

  // Hover cursor change on eyepiece
  renderer.domElement.addEventListener('pointermove', function (e) {
    if (isZoomed) return;
    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObjects(eyepieceMeshes, false);
    renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
  });

  // === RESIZE ===
  function resize() {
    var w = container.clientWidth;
    var h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', resize);
  resize();

  // === ANIMATE ===
  var clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    var t = clock.getElapsedTime();

    glow.material.opacity = 0.55 + Math.sin(t * 2) * 0.2;
    medium.material.opacity = 0.38 + Math.sin(t * 1.3 + 1) * 0.08;

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  function roundedRect(shape, x, y, w, h, r) {
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
  }
})();
