import React, { useState, useCallback, useEffect, useRef } from 'react';
import Map from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { START_DATE, MAPBOX_TOKEN } from '../../utils/map/constants.js'; 
import getSelectedCensusTracts, { cleanupHighlightLayers } from '../../utils/map/censusAnalysis';
import { useMapLayers } from '../../hooks/map/useMapLayers';
import { useTimeAnimation } from '../../hooks/map/useTimeAnimation';
import MapControls from './controls'; 
import MapAdditionalControls from './panels/MapAdditionalControls';
import LoadingOverlay from './LoadingOverlay';
import AreaAnalysis from './panels/AreaAnalysis';
import { BASEMAPS } from '../../constants/map/basemaps';
import { TILESET_INFO } from '../../utils/map/constants.js';
import DrawingTooltip from './DrawingTooltip';
import PopulationExposureCounter from './controls/PopulationExposureCounter';
import handleEnhancedMapClick  from './controls/handleEnhancedMapClick.js';
import ZoomControls from './controls/ZoomControls';
import { setupCensusLayers, updateCensusLayerColors } from '../../utils/map/censusLayers.js';
import { censusPreloader } from '../../utils/map/censusPreloader';


const MapComponent = () => {
  const mapRef = useRef(null);
  const needsLayerReinitRef = useRef(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [isPointSelected, setIsPointSelected] = useState(false);
  const [mousePosition, setMousePosition] = useState(null);
  const [currentHour, setCurrentHour] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [viewport, setViewport] = useState({
    latitude: 39.8283,
    longitude: -98.5795,
    zoom: 4.5,
    minZoom: 4.5,
    maxZoom: 9,
  });
  const [pm25Threshold, setPM25Threshold] = useState(1);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentBasemap, setCurrentBasemap] = useState(BASEMAPS.light.url);
  const [drawingMode, setDrawingMode] = useState(false);
  const [polygon, setPolygon] = useState(null);
  const [tempPolygon, setTempPolygon] = useState([]);

  useTimeAnimation(isPlaying, playbackSpeed, setCurrentHour);

  const layerSetupComplete = useRef(false);
  const styleLoadCount = useRef(0);
  const initialSetupDone = useRef(false);

  const [censusLoading, setCensusLoading] = useState(false);
  const [censusError, setCensusError] = useState(null);

  

  const handleMapInteraction = useCallback((evt) => {
    if (isMapLoaded) {
      setViewport(evt.viewState);
    }
  }, [isMapLoaded]);


  const setupCensusLayers = useCallback((map, darkMode) => {
    if (!map || !map.getStyle() || !map.isStyleLoaded()) {
      console.log('Map not ready for layer setup');
      return false;
    }

    try {
      // Only log when actually setting up layers
      if (!map.getLayer('census-tracts-layer')) {
        console.log('Setting up census tract layers...');
      }
      
      // Clean up existing layers first
      if (map.getLayer('census-tracts-layer')) {
        map.removeLayer('census-tracts-layer');
      }
      if (map.getSource('census-tracts')) {
        map.removeSource('census-tracts');
      }

      // Add source and layer
      map.addSource('census-tracts', {
        type: 'vector',
        url: 'mapbox://pkulandh.3r0plqr0'
      });

      map.addLayer({
        id: 'census-tracts-layer',
        type: 'fill',
        source: 'census-tracts',
        'source-layer': 'cb_2019_us_tract_500k-2qnt3v',
        paint: {
          'fill-color': darkMode ? '#374151' : '#6B7280',
          'fill-opacity': 0,
          'fill-outline-color': darkMode ? '#4B5563' : '#374151'
        }
      });

      layerSetupComplete.current = true;
      return true;
    } catch (error) {
      console.error('Error setting up census tract layers:', error);
      layerSetupComplete.current = false;
      return false;
    }
  }, []);

  const updateCensusLayerColors = useCallback((map, darkMode) => {
    if (!map || !map.getLayer('census-tracts-layer')) return;

    try {
      map.setPaintProperty(
        'census-tracts-layer',
        'fill-color',
        darkMode ? '#374151' : '#6B7280'
      );
      map.setPaintProperty(
        'census-tracts-layer',
        'fill-outline-color',
        darkMode ? '#4B5563' : '#374151'
      );
    } catch (error) {
      console.error('Error updating census layer colors:', error);
    }
  }, []);
  

  const handleThemeChange = useCallback((darkMode) => {
    setIsDarkMode(darkMode);
    if (currentBasemap !== BASEMAPS.satellite.url) {
      setCurrentBasemap(darkMode ? BASEMAPS.darkMatter.url : BASEMAPS.light.url);
    }
    needsLayerReinitRef.current = true;
  }, [currentBasemap]);



  const handleMapLoad = useCallback(() => {
    if (layerSetupComplete.current) return;
    
    console.log('Map loaded, initializing...');
    setIsMapLoaded(true);
    if (mapRef.current) {
      const map = mapRef.current.getMap();
      setMapInstance(map);
      
      // Wait for style to be loaded
      if (!map.isStyleLoaded()) {
        map.once('style.load', () => {
          setupCensusLayers(map, isDarkMode);
        });
      } else {
        setupCensusLayers(map, isDarkMode);
      }
    }
  }, [isDarkMode, setupCensusLayers]);
  

  const getCurrentDateTime = useCallback(() => {
    const msPerHour = 60 * 60 * 1000;
    const currentDate = new Date(START_DATE.getTime() + (currentHour * msPerHour));
    const date = currentDate.toISOString().split('T')[0];
    const hour = currentDate.getUTCHours();
  
    const currentTileset = TILESET_INFO.find(tileset => 
      tileset.date === date && 
      hour >= tileset.startHour && 
      hour <= tileset.endHour
    );
  
    if (!currentTileset) {
      console.warn('No tileset found for:', { date, hour, currentHour });
      return { date: '', hour: 0 };
    }
  
    return { date, hour };
  }, [currentHour]);

  const { updateLayers } = useMapLayers(
    mapRef,
    pm25Threshold,
    currentHour,
    isMapLoaded,
    getCurrentDateTime,
    isDarkMode,
    needsLayerReinitRef
  );
  
  const handleBasemapChange = useCallback((newBasemap) => {
    setCurrentBasemap(newBasemap);
    needsLayerReinitRef.current = true;
    layerSetupComplete.current = false;
  }, []);

  const handleMapClick = useCallback(async (e) => {
    if (!isPointSelected && mapInstance) {
      try {
        // Wait for census layer to be ready
        if (!mapInstance.getLayer('census-tracts-layer')) {
          console.log('Waiting for census layer to be ready...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
  
        const selection = await handleEnhancedMapClick(e, mapInstance, {
          initialZoomLevel: 7,
          zoomDuration: 1000,
          selectionDelay: 500,
          selectionRadius: 0.1
        });
  
        setPolygon(selection.polygon);
        setIsPointSelected(true);
        setIsPlaying(true);
  
        // Get census data for the selected area
        const censusData = await getSelectedCensusTracts(mapInstance, selection.polygon, isDarkMode);
        console.log('Selected area census data:', censusData);
      } catch (error) {
        console.error('Error handling map click:', error);
      }
    }
  }, [drawingMode, isPointSelected, mapInstance, setIsPlaying, isDarkMode]);
    

  const cleanupCensusLayers = useCallback((map) => {
    if (!map) return;
  
    try {
      if (map.getLayer('census-tracts-layer')) {
        map.removeLayer('census-tracts-layer');
      }
      if (map.getSource('census-tracts')) {
        map.removeSource('census-tracts');
      }
      layerSetupComplete.current = false;
    } catch (error) {
      console.error('Error cleaning up census layers:', error);
    }
  }, []);


  const clearPolygon = useCallback(() => {
    if (polygon) {
      // Clean up census highlight layers
      cleanupHighlightLayers(mapInstance);
    }
    // Clear polygon state
    setPolygon(null);
    setTempPolygon([]);
    setDrawingMode(false);
    setIsPlaying(false);
    setIsPointSelected(false);
  
    // Clear area statistics data
    const analysisComponent = document.querySelector('[data-component="area-analysis"]');
    if (analysisComponent) {
      analysisComponent.dispatchEvent(new CustomEvent('clearData'));
    }
  
    // Reset cursor
    if (mapInstance) {
      mapInstance.getCanvas().style.cursor = '';
    }
  }, [mapInstance, polygon, setIsPlaying]);


  // Update cursor based on whether point selection is allowed
  const getCursor = useCallback(() => {
    if (drawingMode) return 'crosshair';
    if (isPointSelected) return 'not-allowed';
    return 'pointer';
  }, [drawingMode, isPointSelected]);

  // Area selection controls
  const startDrawing = useCallback(() => {
    setDrawingMode(true);
    setTempPolygon([]);
    setPolygon(null);
    if (mapInstance) {
      mapInstance.getCanvas().style.cursor = 'crosshair';
    }
  }, [mapInstance]);

  const finishDrawing = useCallback(() => {
    if (tempPolygon.length >= 3) {
      const finalPolygon = [...tempPolygon, tempPolygon[0]];
      setPolygon(finalPolygon);
    }
    setDrawingMode(false);
    setTempPolygon([]);
    if (mapInstance) {
      mapInstance.getCanvas().style.cursor = '';
    }
  }, [tempPolygon, mapInstance]);

  useEffect(() => {
    if (!mapInstance || !isMapLoaded) return;

    const initializeCensusLayer = async () => {
      setCensusLoading(true);
      setCensusError(null);

      try {
        // Subscribe to progress updates
        const unsubscribe = censusPreloader.onProgress(({ stage, progress }) => {
          console.debug(`Census ${stage} progress: ${progress}%`);
        });

        // Initialize the layer
        await censusPreloader.preloadAll(mapInstance, isDarkMode);

      } catch (error) {
        console.error('Failed to initialize census layer:', error);
        setCensusError(error.message);
      } finally {
        setCensusLoading(false);
      }
    };

    initializeCensusLayer();

    // Cleanup function
    return () => {
      censusPreloader.cleanup(mapInstance);
    };
  }, [mapInstance, isMapLoaded, isDarkMode]);

  useEffect(() => {
    if (!mapInstance || !isMapLoaded) return;
    censusPreloader.updateColors(mapInstance, isDarkMode);
  }, [isDarkMode, mapInstance, isMapLoaded]);

  useEffect(() => {
    if (!mapInstance || !isMapLoaded) return;

    const handleStyleData = () => {
      if (!mapInstance.isStyleLoaded()) {
        console.log('Waiting for style to load...');
        return;
      }

      // Only reinitialize if explicitly needed or layers are missing
      if (needsLayerReinitRef.current || !mapInstance.getLayer('census-tracts-layer')) {
        const success = setupCensusLayers(mapInstance, isDarkMode);
        if (success) {
          needsLayerReinitRef.current = false;
          if (!initialSetupDone.current) {
            console.log('Initial setup completed');
            initialSetupDone.current = true;
          }
        }
      }
    };

    // Handle initial setup
    if (!initialSetupDone.current) {
      handleStyleData();
    }

    // Listen for style changes
    mapInstance.on('styledata', handleStyleData);

    return () => {
      mapInstance.off('styledata', handleStyleData);
    };
  }, [mapInstance, isMapLoaded, isDarkMode, setupCensusLayers]);



    useEffect(() => {
      if (!mapInstance || !drawingMode) return;

      const handleMouseMove = (e) => {
        setMousePosition([e.lngLat.lng, e.lngLat.lat]);
      };

      mapInstance.on('mousemove', handleMouseMove);
      return () => {
        mapInstance.off('mousemove', handleMouseMove);
        setMousePosition(null);
      };
    }, [mapInstance, drawingMode]);

    useEffect(() => {
      return () => {
        if (mapInstance) {
          cleanupCensusLayers(mapInstance);
          layerSetupComplete.current = false;
        }
      };
    }, [mapInstance, cleanupCensusLayers]);

    useEffect(() => {
      return () => {
        if (mapInstance) {
          if (mapInstance.getLayer('census-tracts-layer')) {
            mapInstance.removeLayer('census-tracts-layer');
          }
          if (mapInstance.getSource('census-tracts')) {
            mapInstance.removeSource('census-tracts');
          }
        }
      };
    }, [mapInstance]);


    useEffect(() => {
      if (!mapInstance || mapInstance._removed) return;

      const sourceId = 'polygon-source';
      const layerId = 'polygon-layer';
      const outlineLayerId = `${layerId}-outline`;
      const previewLayerId = `${layerId}-preview`;

      // Cleanup function to remove all layers and sources
      const cleanup = () => {
        if (mapInstance && !mapInstance._removed) {
          [previewLayerId, outlineLayerId, layerId].forEach(id => {
            if (mapInstance.getLayer(id)) {
              mapInstance.removeLayer(id);
            }
          });
          if (mapInstance.getSource(sourceId)) {
            mapInstance.removeSource(sourceId);
          }
        }
      };

      cleanup();

      if (polygon || tempPolygon.length > 0) {
        try {
          // Create coordinates array based on whether we have a complete polygon or temp points
          const coordinates = polygon ? 
            [polygon] : 
            tempPolygon.length > 0 && mousePosition ? 
              [[...tempPolygon, mousePosition, tempPolygon[0]]] : 
              [tempPolygon];

          // Add the source
          mapInstance.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates
              }
            }
          });

          // Add fill layer
          mapInstance.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': isDarkMode ? '#60A5FA' : '#3B82F6',
              'fill-opacity': isDarkMode ? 0.3 : 0.2
            }
          });

          // Add outline layer
          mapInstance.addLayer({
            id: outlineLayerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': isDarkMode ? '#60A5FA' : '#3B82F6',
              'line-width': 2
            }
          });

          // Add preview line layer (only during drawing)
          if (drawingMode && mousePosition && tempPolygon.length > 0) {
            mapInstance.addLayer({
              id: previewLayerId,
              type: 'line',
              source: sourceId,
              paint: {
                'line-color': isDarkMode ? '#60A5FA' : '#3B82F6',
                'line-width': 2,
                'line-dasharray': [2, 2]
              }
            });
          }

          // Add vertices as points (optional)
          if (tempPolygon.length > 0) {
            const vertexSourceId = `${sourceId}-vertices`;
            const vertexLayerId = `${layerId}-vertices`;

            // Add vertex source
            mapInstance.addSource(vertexSourceId, {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: tempPolygon.map(coord => ({
                  type: 'Feature',
                  geometry: {
                    type: 'Point',
                    coordinates: coord
                  }
                }))
              }
            });

            // Add vertex layer
            mapInstance.addLayer({
              id: vertexLayerId,
              type: 'circle',
              source: vertexSourceId,
              paint: {
                'circle-radius': 5,
                'circle-color': isDarkMode ? '#60A5FA' : '#3B82F6',
                'circle-stroke-width': 2,
                'circle-stroke-color': 'white'
              }
            });
          }

        } catch (error) {
          console.error('Error adding polygon layers:', error);
        }
      }

      // Return cleanup function
      return cleanup;
    }, [
      mapInstance,
      polygon,
      tempPolygon,
      mousePosition,
      drawingMode,
      isDarkMode
    ]);



  
  return (
    <div className={`fixed inset-0 overflow-hidden ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <Map
        {...viewport}
        style={{ width: '100%', height: '100%' }}
        mapStyle={currentBasemap}
        mapboxAccessToken={MAPBOX_TOKEN}
        onMove={handleMapInteraction}
        ref={mapRef}
        onLoad={handleMapLoad}
        onClick={handleMapClick}
        cursor={getCursor()}
      />
      
      {!isMapLoaded && <LoadingOverlay isDarkMode={isDarkMode} />}

      {censusLoading && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg ${
          isDarkMode ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-800'
        } shadow-lg z-50`}>
          Loading census data...
        </div>
      )}

      {censusError && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg ${
          isDarkMode ? 'bg-red-900/90 text-red-200' : 'bg-red-50 text-red-600'
        } shadow-lg z-50`}>
          {censusError}
        </div>
      )}
      
      {isMapLoaded && mapInstance && (
        <>
          <ZoomControls map={mapInstance} isDarkMode={isDarkMode} />
  
          {/* Left side overlays container */}
          <div className="fixed top-4 left-4 z-50">
            <div className="flex flex-col gap-2">
              {polygon && (
                <div className="w-80">
                  <div className={`backdrop-blur-sm rounded-lg shadow-lg px-4 py-3 ${
                    isDarkMode ? 'bg-gray-800/95 text-gray-200' : 'bg-white/95 text-gray-800'
                  }`}>
                    <PopulationExposureCounter
                      map={mapInstance}
                      polygon={polygon}
                      isDarkMode={isDarkMode}
                      currentDateTime={getCurrentDateTime()}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
  
          {/* Right side panels */}
          <AreaAnalysis
            map={mapInstance}
            currentDateTime={getCurrentDateTime()}
            isPlaying={isPlaying}
            polygon={polygon}
            isDarkMode={isDarkMode}
            onExpandChange={(expanded) => {
            }}
          />
  
          <MapAdditionalControls
            map={mapInstance}
            mapStyle={currentBasemap}
            mapboxAccessToken={MAPBOX_TOKEN}
            polygon={polygon}
            currentDateTime={getCurrentDateTime()}
            isDarkMode={isDarkMode}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            currentHour={currentHour}
            setCurrentHour={setCurrentHour}
            onExpandChange={(expanded) => {
            }}
          />
  
          <DrawingTooltip 
            drawingMode={drawingMode} 
            tempPolygon={tempPolygon}
          />
  
          {/* Bottom controls */}
          <MapControls
            currentHour={currentHour}
            setCurrentHour={setCurrentHour}
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
            isDarkMode={isDarkMode}
            setIsDarkMode={handleThemeChange}
            currentBasemap={currentBasemap}
            setCurrentBasemap={setCurrentBasemap}
            basemapOptions={BASEMAPS}
            mapInstance={mapInstance}
            pm25Threshold={pm25Threshold}
            setPM25Threshold={setPM25Threshold}
          />
        </>
      )}
    </div>
  );
};

export default MapComponent;