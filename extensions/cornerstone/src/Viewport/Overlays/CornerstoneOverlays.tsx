import React, { useEffect, useState } from 'react';
import ViewportImageScrollbar from './ViewportImageScrollbar';
import CustomizableViewportOverlay from './CustomizableViewportOverlay';
import ViewportOrientationMarkers from './ViewportOrientationMarkers';
import ViewportImageSliceLoadingIndicator from './ViewportImageSliceLoadingIndicator';
import { useAppContext } from '../../../../../platform/app/src/AppContext';

function CornerstoneOverlays(props: withAppTypes) {
  const { blobUrl } = useAppContext(); // Get blobUrl from the app context
  const { viewportId, element, scrollbarHeight, servicesManager } = props;
  const { cornerstoneViewportService } = servicesManager.services;

  const [imageSliceData, setImageSliceData] = useState({
    imageIndex: 0,
    numberOfSlices: 0,
  });
  const [viewportData, setViewportData] = useState(null);

  useEffect(() => {
    const { unsubscribe } = cornerstoneViewportService.subscribe(
      cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED,
      props => {
        if (props.viewportId !== viewportId) {
          return;
        }

        setViewportData(props.viewportData);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [viewportId]);

  if (!element) {
    return null;
  }

  // If blobUrl exists, override the existing display with the image from blobUrl
  if (blobUrl) {
    return (
      <div
        className="blob-url-overlay"
        style={{ position: 'relative', height: '100%', width: '100%' }}
      >
        <img
          src={blobUrl}
          alt="AI Processed Result"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: '100%',
            objectFit: 'contain',
            zIndex: 10, // Ensure the image appears on top of the other overlays
          }}
        />
      </div>
    );
  }

  if (viewportData) {
    const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);

    if (viewportInfo?.viewportOptions?.customViewportProps?.hideOverlays) {
      return null;
    }
  }

  return (
    <div className="noselect">
      <ViewportImageScrollbar
        viewportId={viewportId}
        viewportData={viewportData}
        element={element}
        imageSliceData={imageSliceData}
        setImageSliceData={setImageSliceData}
        scrollbarHeight={scrollbarHeight}
        servicesManager={servicesManager}
      />

      <CustomizableViewportOverlay
        imageSliceData={imageSliceData}
        viewportData={viewportData}
        viewportId={viewportId}
        servicesManager={servicesManager}
        element={element}
      />

      <ViewportImageSliceLoadingIndicator
        viewportData={viewportData}
        element={element}
      />

      <ViewportOrientationMarkers
        imageSliceData={imageSliceData}
        element={element}
        viewportData={viewportData}
        servicesManager={servicesManager}
        viewportId={viewportId}
      />
    </div>
  );
}

export default CornerstoneOverlays;
