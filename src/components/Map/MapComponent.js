import React, { useState, useCallback, useEffect, useRef } from 'react';
import Map from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, START_DATE, SKIPPED_HOURS } from './constants';
import { useMapLayers } from './hooks/useMapLayers';
import { useTimeAnimation } from './hooks/useTimeAnimation';
import MapControls from './MapControls';
import MapAdditionalControls from './MapAdditionalControls';
import LoadingOverlay from './LoadingOverlay';
import AreaAnalysis from './AreaAnalysis';

const MapComponent = () => {
  const [viewport, setViewport] = useState({
    latitude: 39.8283,
    longitude: -98.5795,
    zoom: 4,
    minZoom: 4,
    maxZoom: 8,
  });

  const [currentHour, setCurrentHour] = useState(0);
  const [aqiThreshold, setAqiThreshold] = useState(0);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const mapRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);

  // Drawing state
  const [drawingMode, setDrawingMode] = useState(false);
  const [polygon, setPolygon] = useState(null);
  const [tempPolygon, setTempPolygon] = useState([]);

  const getCurrentDateTime = useCallback(() => {
    let adjustedHour = currentHour;
    if (adjustedHour >= 12) { 
      adjustedHour += SKIPPED_HOURS;
    }
    const currentDate = new Date(START_DATE.getTime() + adjustedHour * 60 * 60 * 1000);
    return {
      date: currentDate.toISOString().split('T')[0],
      hour: currentDate.getHours(),
    };
  }, [currentHour]);

  const { updateLayers } = useMapLayers(mapRef, aqiThreshold, currentHour, isMapLoaded, getCurrentDateTime);

  useTimeAnimation(isPlaying, playbackSpeed, setCurrentHour);

  const handleMapLoad = useCallback(() => {
    setIsMapLoaded(true);
    if (mapRef.current) {
      setMapInstance(mapRef.current.getMap());
    }
    console.log('Map loaded');
  }, []);

  const handleMapInteraction = useCallback((evt) => {
    if (isMapLoaded) {
      setViewport(evt.viewState);
    }
  }, [isMapLoaded]);

  // Update layers when necessary
  useEffect(() => {
    if (mapInstance && isMapLoaded) {
      updateLayers(mapInstance);
    }
  }, [updateLayers, isMapLoaded, mapInstance]);

  // Polygon drawing functions
  const startDrawing = useCallback(() => {
    setDrawingMode(true);
    setTempPolygon([]);
    setPolygon(null);
    if (mapInstance) {
      mapInstance.getCanvas().style.cursor = 'crosshair';
    }
  }, [mapInstance]);

  const handleMapClick = useCallback((e) => {
    if (!drawingMode) return;
    const { lng, lat } = e.lngLat;
    setTempPolygon(prev => [...prev, [lng, lat]]);
  }, [drawingMode]);

  const finishDrawing = useCallback(() => {
    if (tempPolygon.length >= 3) {
      setPolygon([...tempPolygon, tempPolygon[0]]);
      setDrawingMode(false);
      setTempPolygon([]);
      if (mapInstance) {
        mapInstance.getCanvas().style.cursor = '';
      }
    }
  }, [tempPolygon, mapInstance]);

  const clearPolygon = useCallback(() => {
    setPolygon(null);
    setTempPolygon([]);
  }, []);

  // Map click handler
  useEffect(() => {
    if (mapInstance) {
      mapInstance.on('click', handleMapClick);
      return () => {
        if (mapInstance && !mapInstance._removed) {
          mapInstance.off('click', handleMapClick);
        }
      };
    }
  }, [mapInstance, handleMapClick]);

  // Polygon rendering
  useEffect(() => {
    if (!mapInstance || mapInstance._removed) return;

    const sourceId = 'polygon-source';
    const layerId = 'polygon-layer';
    const outlineLayerId = `${layerId}-outline`;

    const cleanup = () => {
      if (mapInstance && !mapInstance._removed) {
        if (mapInstance.getLayer(outlineLayerId)) {
          mapInstance.removeLayer(outlineLayerId);
        }
        if (mapInstance.getLayer(layerId)) {
          mapInstance.removeLayer(layerId);
        }
        if (mapInstance.getSource(sourceId)) {
          mapInstance.removeSource(sourceId);
        }
      }
    };

    cleanup();

    if (polygon || tempPolygon.length > 0) {
      try {
        mapInstance.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [polygon || [...tempPolygon, tempPolygon[0]]]
            }
          }
        });

        mapInstance.addLayer({
          id: layerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': 'blue',
            'fill-opacity': 0.2,
          }
        });

        mapInstance.addLayer({
          id: outlineLayerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': 'blue',
            'line-width': 2,
          }
        });
      } catch (error) {
        console.error('Error adding polygon layers:', error);
      }
    }

    return cleanup;
  }, [mapInstance, polygon, tempPolygon]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <Map
          {...viewport}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/light-v10"
          mapboxAccessToken={MAPBOX_TOKEN}
          onMove={handleMapInteraction}
          ref={mapRef}
          onLoad={handleMapLoad}
        />
        {!isMapLoaded && <LoadingOverlay />}
      </div>
      {isMapLoaded && mapInstance && (
        <AreaAnalysis 
          map={mapInstance} 
          currentDateTime={getCurrentDateTime()}
          isPlaying={isPlaying}
          polygon={polygon}
        />
      )}
      <MapControls
        currentHour={currentHour}
        setCurrentHour={setCurrentHour}
        aqiThreshold={aqiThreshold}
        setAqiThreshold={setAqiThreshold}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        playbackSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeed}
        getCurrentDateTime={getCurrentDateTime}
        drawingMode={drawingMode}
        startDrawing={startDrawing}
        finishDrawing={finishDrawing}
        clearPolygon={clearPolygon}
        polygon={polygon}
      />
      {isMapLoaded && mapInstance && (
        <MapAdditionalControls
          map={mapInstance}
          mapStyle="mapbox://styles/mapbox/light-v10"
          mapboxAccessToken={MAPBOX_TOKEN}
          polygon={polygon}
          currentDateTime={getCurrentDateTime()}
          aqiThreshold={aqiThreshold}
        />
      )}
    </div>
  );
};

export default MapComponent;