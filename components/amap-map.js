'use client';

import { useEffect, useRef, useState } from 'react';

let loaderPromise;

function loadAmap() {
  const key = process.env.NEXT_PUBLIC_AMAP_KEY;
  const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;
  if (!key || !securityCode) return Promise.reject(new Error('高德 Web 端 Key 尚未配置'));
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loaderPromise) return loaderPromise;

  window._AMapSecurityConfig = { securityJsCode: securityCode };
  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => resolve(window.AMap);
    script.onerror = () => reject(new Error('高德地图加载失败'));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

export default function AmapMap({ center, pois, selectedIds, radius, onToggle, onError }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAmap().then(AMap => {
      if (cancelled || !containerRef.current) return;
      mapRef.current = new AMap.Map(containerRef.current, {
        center,
        zoom: 15,
        resizeEnable: true,
        viewMode: '2D'
      });
      setReady(true);
    }).catch(error => onError?.(error.message));
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.AMap) return;
    const AMap = window.AMap;
    const map = mapRef.current;
    map.clearMap();
    map.setCenter(center);

    const centerNode = document.createElement('div');
    centerNode.className = 'amap-building-marker';
    centerNode.textContent = '楼';
    new AMap.Marker({ map, position: center, content: centerNode, offset: new AMap.Pixel(-18, -18), zIndex: 120 });
    const coverageCircle = new AMap.Circle({
      map,
      center,
      radius,
      strokeColor: '#0c7c68',
      strokeOpacity: 0.6,
      strokeWeight: 1,
      fillColor: '#0c7c68',
      fillOpacity: 0.06
    });

    map.setFitView([coverageCircle], false, [24, 24, 24, 24], 17);

    pois.forEach(poi => {
      const markerNode = document.createElement('button');
      markerNode.type = 'button';
      markerNode.className = `amap-poi-marker ${selectedIds.includes(poi.id) ? 'selected' : ''}`;
      markerNode.textContent = poi.group === '餐饮' ? '餐' : poi.group === '休闲娱乐' ? '娱' : poi.group === '服务配套' ? '服' : '零';
      markerNode.title = `${poi.merchant}，${poi.distance}米`;
      markerNode.addEventListener('click', () => onToggle(poi.id));
      new AMap.Marker({
        map,
        position: [poi.lng, poi.lat],
        content: markerNode,
        offset: new AMap.Pixel(-16, -16),
        zIndex: selectedIds.includes(poi.id) ? 110 : 100
      });
    });
  }, [center, pois, radius, ready, selectedIds, onToggle]);

  return <div ref={containerRef} className="amap-stage" aria-label="融科资讯中心周边高德地图" />;
}
