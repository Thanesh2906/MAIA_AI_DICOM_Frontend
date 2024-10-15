import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useImageViewer, useViewportGrid } from '@ohif/ui';
import { StudyBrowser as NewStudyBrowser } from '@ohif/ui-next';
import { StudyBrowser as OldStudyBrowser } from '@ohif/ui';
import { utils } from '@ohif/core';
import { useAppConfig } from '@state';
import { useNavigate } from 'react-router-dom';
import { Separator } from '@ohif/ui-next';
import { PanelStudyBrowserHeader } from './PanelStudyBrowserHeader';
import { defaultActionIcons, defaultViewPresets } from './constants';
import { Button } from '@ohif/ui';
import { useAppContext } from '../../../../../platform/app/src/AppContext';

const { sortStudyInstances, formatDate, createStudyBrowserTabs } = utils;

/**
 *
 * @param {*} param0
 */
function PanelStudyBrowserAi({
  servicesManager,
  getImageSrc,
  getStudiesForPatientByMRN,
  requestDisplaySetCreationForStudy,
  dataSource,
  renderHeader,
  getCloseIcon,
  tab,
}: withAppTypes) {
  const { hangingProtocolService, displaySetService, uiNotificationService, customizationService } =
    servicesManager.services;
  const navigate = useNavigate();
  const [appConfig] = useAppConfig();

  // Normally you nest the components so the tree isn't so deep, and the data
  // doesn't have to have such an intense shape. This works well enough for now.
  // Tabs --> Studies --> DisplaySets --> Thumbnails
  const { StudyInstanceUIDs } = useImageViewer();
  const [{ activeViewportId, viewports, isHangingProtocolLayout }, viewportGridService] =
    useViewportGrid();
  const [activeTabName, setActiveTabName] = useState('primary');
  const [expandedStudyInstanceUIDs, setExpandedStudyInstanceUIDs] = useState([
    ...StudyInstanceUIDs,
  ]);
  const [hasLoadedViewports, setHasLoadedViewports] = useState(false);
  const [studyDisplayList, setStudyDisplayList] = useState([]);
  const [displaySets, setDisplaySets] = useState([]);
  const [thumbnailImageSrcMap, setThumbnailImageSrcMap] = useState({});

  const [viewPresets, setViewPresets] = useState(
    customizationService.getCustomization('studyBrowser.viewPresets')?.value || defaultViewPresets
  );

  const [actionIcons, setActionIcons] = useState(defaultActionIcons);
  const [clickedImage, setClickedImage] = useState(null);
  const { setBlobUrl, setBlobbing } = useAppContext();

  // multiple can be true or false
  const updateActionIconValue = actionIcon => {
    actionIcon.value = !actionIcon.value;
    const newActionIcons = [...actionIcons];
    setActionIcons(newActionIcons);
  };

  // only one is true at a time
  const updateViewPresetValue = viewPreset => {
    if (!viewPreset) {
      return;
    }
    const newViewPresets = viewPresets.map(preset => {
      preset.selected = preset.id === viewPreset.id;
      return preset;
    });
    setViewPresets(newViewPresets);
  };

  const onDoubleClickThumbnailHandler = async displaySetInstanceUID => {
    let updatedViewports = [];
    const viewportId = activeViewportId;
    try {
      updatedViewports = hangingProtocolService.getViewportsRequireUpdate(
        viewportId,
        displaySetInstanceUID,
        isHangingProtocolLayout
      );
      // setBlobUrl(null);
      setBlobbing(false);

      // Get the display set using the displaySetInstanceUID
      const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

      // Get the image IDs for the display set
      const imageIds = dataSource.getImageIdsForDisplaySet(displaySet);

      // Assuming you want to get the middle image ID
      const imageId = imageIds[Math.floor(imageIds.length / 2)];
      console.log('imageId', imageId);

      // Use getImageSrc to get the actual image source
      const imageSrc = await getImageSrc(imageId);

      // Now you can do something with the imageSrc, like updating the viewport or displaying it
      const base64String = imageSrc.replace(/^data:image\/\w+;base64,/, '');
      console.log('Image Source:', base64String);
      setClickedImage(base64String);
    } catch (error) {
      console.warn(error);
      uiNotificationService.show({
        title: 'Thumbnail Double Click',
        message: 'The selected display sets could not be added to the viewport.',
        type: 'info',
        duration: 3000,
      });
    }

    viewportGridService.setDisplaySetsForViewports(updatedViewports);
    console.log('updatedViewports', updatedViewports);
  };

  // ~~ studyDisplayList
  useEffect(() => {
    console.log('fetchStudiesForPatient useEffect');

    // Fetch all studies for the patient in each primary study
    async function fetchStudiesForPatient(StudyInstanceUID) {
      // current study qido
      const qidoForStudyUID = await dataSource.query.studies.search({
        studyInstanceUid: StudyInstanceUID,
      });

      if (!qidoForStudyUID?.length) {
        navigate('/notfoundstudy', '_self');
        throw new Error('Invalid study URL');
      }

      let qidoStudiesForPatient = qidoForStudyUID;

      // try to fetch the prior studies based on the patientID if the
      // server can respond.
      try {
        qidoStudiesForPatient = await getStudiesForPatientByMRN(qidoForStudyUID);
      } catch (error) {
        console.warn(error);
      }

      const mappedStudies = _mapDataSourceStudies(qidoStudiesForPatient);
      const actuallyMappedStudies = mappedStudies.map(qidoStudy => {
        return {
          studyInstanceUid: qidoStudy.StudyInstanceUID,
          date: formatDate(qidoStudy.StudyDate),
          description: qidoStudy.StudyDescription,
          modalities: qidoStudy.ModalitiesInStudy,
          numInstances: qidoStudy.NumInstances,
        };
      });

      setStudyDisplayList(prevArray => {
        const ret = [...prevArray];
        for (const study of actuallyMappedStudies) {
          if (!prevArray.find(it => it.studyInstanceUid === study.studyInstanceUid)) {
            ret.push(study);
          }
        }
        return ret;
      });
    }

    StudyInstanceUIDs.forEach(sid => fetchStudiesForPatient(sid));
  }, [StudyInstanceUIDs, dataSource, getStudiesForPatientByMRN, navigate]);

  // // ~~ Initial Thumbnails
  useEffect(() => {
    console.log('hasLoadedViewports useEffect');

    if (!hasLoadedViewports) {
      if (activeViewportId) {
        // Once there is an active viewport id, it means the layout is ready
        // so wait a bit of time to allow the viewports preferential loading
        // which improves user experience of responsiveness significantly on slower
        // systems.
        window.setTimeout(() => setHasLoadedViewports(true), 250);
      }

      return;
    }

    const currentDisplaySets = displaySetService.activeDisplaySets;
    currentDisplaySets.forEach(async dSet => {
      const newImageSrcEntry = {};
      const displaySet = displaySetService.getDisplaySetByUID(dSet.displaySetInstanceUID);
      const imageIds = dataSource.getImageIdsForDisplaySet(displaySet);
      const imageId = imageIds[Math.floor(imageIds.length / 2)];

      // TODO: Is it okay that imageIds are not returned here for SR displaySets?
      if (!imageId || displaySet?.unsupported) {
        return;
      }
      // When the image arrives, render it and store the result in the thumbnailImgSrcMap
      newImageSrcEntry[dSet.displaySetInstanceUID] = await getImageSrc(imageId);

      console.log('newImageSrcEntry', newImageSrcEntry[dSet.displaySetInstanceUID]);
      setThumbnailImageSrcMap(prevState => {
        return { ...prevState, ...newImageSrcEntry };
      });
    });
  }, [
    StudyInstanceUIDs,
    dataSource,
    displaySetService,
    getImageSrc,
    hasLoadedViewports,
    activeViewportId,
  ]);

  // ~~ displaySets
  useEffect(() => {
    console.log('currentDisplaySets useEffect');

    // TODO: Are we sure `activeDisplaySets` will always be accurate?
    const currentDisplaySets = displaySetService.activeDisplaySets;
    const mappedDisplaySets = _mapDisplaySets(currentDisplaySets, thumbnailImageSrcMap);
    sortStudyInstances(mappedDisplaySets);

    setDisplaySets(mappedDisplaySets);
  }, [StudyInstanceUIDs, thumbnailImageSrcMap, displaySetService]);

  // ~~ subscriptions --> displaySets
  useEffect(() => {
    // DISPLAY_SETS_ADDED returns an array of DisplaySets that were added
    const SubscriptionDisplaySetsAdded = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_ADDED,
      data => {
        // for some reason this breaks thumbnail loading
        // if (!hasLoadedViewports) {
        //   return;
        // }
        const { displaySetsAdded, options } = data;
        displaySetsAdded.forEach(async dSet => {
          const newImageSrcEntry = {};
          const displaySet = displaySetService.getDisplaySetByUID(dSet.displaySetInstanceUID);
          if (displaySet?.unsupported) {
            return;
          }

          const imageIds = dataSource.getImageIdsForDisplaySet(displaySet);
          const imageId = imageIds[Math.floor(imageIds.length / 2)];
          console.log('imageIds', imageIds);

          // TODO: Is it okay that imageIds are not returned here for SR displaysets?
          if (!imageId) {
            return;
          }
          // When the image arrives, render it and store the result in the thumbnailImgSrcMap
          newImageSrcEntry[dSet.displaySetInstanceUID] = await getImageSrc(
            imageId,
            dSet.initialViewport
          );

          setClickedImage(
            newImageSrcEntry[dSet.displaySetInstanceUID].replace(/^data:image\/\w+;base64,/, '')
          );

          setThumbnailImageSrcMap(prevState => {
            return { ...prevState, ...newImageSrcEntry };
          });
        });
      }
    );

    return () => {
      SubscriptionDisplaySetsAdded.unsubscribe();
    };
  }, [getImageSrc, dataSource, displaySetService]);

  useEffect(() => {
    // TODO: Will this always hold _all_ the displaySets we care about?
    // DISPLAY_SETS_CHANGED returns `DisplaySerService.activeDisplaySets`
    console.log('displaySets useEffect');

    const SubscriptionDisplaySetsChanged = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_CHANGED,
      changedDisplaySets => {
        const mappedDisplaySets = _mapDisplaySets(changedDisplaySets, thumbnailImageSrcMap);
        setDisplaySets(mappedDisplaySets);
      }
    );

    const SubscriptionDisplaySetMetaDataInvalidated = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SET_SERIES_METADATA_INVALIDATED,
      () => {
        const mappedDisplaySets = _mapDisplaySets(
          displaySetService.getActiveDisplaySets(),
          thumbnailImageSrcMap
        );

        setDisplaySets(mappedDisplaySets);
      }
    );

    return () => {
      SubscriptionDisplaySetsChanged.unsubscribe();
      SubscriptionDisplaySetMetaDataInvalidated.unsubscribe();
    };
  }, [StudyInstanceUIDs, thumbnailImageSrcMap, displaySetService]);

  const tabs = createStudyBrowserTabs(StudyInstanceUIDs, studyDisplayList, displaySets);

  // TODO: Should not fire this on "close"
  function _handleStudyClick(StudyInstanceUID) {
    const shouldCollapseStudy = expandedStudyInstanceUIDs.includes(StudyInstanceUID);
    const updatedExpandedStudyInstanceUIDs = shouldCollapseStudy
      ? // eslint-disable-next-line prettier/prettier
        [...expandedStudyInstanceUIDs.filter(stdyUid => stdyUid !== StudyInstanceUID)]
      : [...expandedStudyInstanceUIDs, StudyInstanceUID];

    setExpandedStudyInstanceUIDs(updatedExpandedStudyInstanceUIDs);

    if (!shouldCollapseStudy) {
      const madeInClient = true;
      requestDisplaySetCreationForStudy(displaySetService, StudyInstanceUID, madeInClient);
    }
  }

  const activeDisplaySetInstanceUIDs = viewports.get(activeViewportId)?.displaySetInstanceUIDs;

  const StudyBrowser = appConfig?.useExperimentalUI ? NewStudyBrowser : OldStudyBrowser;

  const handlePerformAIDiagnosis = async () => {
    try {
      // Ensure clickedImage is available
      if (!clickedImage) {
        console.warn('No image clicked to perform diagnosis.');
        return;
      }

      // Prepare the POST request
      const response = await fetch(
        'https://maia-dqcmczhwaxf8dqh6.westus2-01.azurewebsites.net/detect_base64',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_base64: clickedImage, // Base64 image string
            image_id: '123', // Replace with the actual image ID if available
            overall_confidence_level: 0.3, // Set this based on your logic
            overlap_confidence_level: 0.3, // Set this based on your logic
          }),
        }
      );

      // Check if the response is ok (status in the range 200-299)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      console.log('response', response);

      // Parse the JSON response
      const result = await response.json();
      console.log('Diagnosis Result:', result);

      // Convert base64 to Blob
      //const mimeType = 'image/jpeg'; // Replace with the actual MIME type if known
      //const fullBase64String = `data:${mimeType};base64,${result.detection_image}`; // Add the MIME type back

      // Convert base64 string to Blob
      // const a = await fetch(`data:image/jpeg;base64,${response['detection_image']}`); // Adjust MIME type if necessary
      // const blob = await a.blob(); // Convert to Blob
      // setBlobUrl(blob);
      // Convert base64 to Blob
      const blob = result.detection_image; // Adjust MIME type if necessary
      console.log('blob', blob);
      setBlobUrl(blob);
      setBlobbing(true);

      // viewportGridService.setDisplaySetsForViewports(blob);
    } catch (error) {
      console.error('Error performing AI diagnosis:', error);
    }
  };

  const handlePerformAIReporting = async () => {
    if (clickedImage) {
      console.log('clickedImage', clickedImage);

      const url = 'https://api.hyperbolic.xyz/v1/chat/completions';

      const base64Image = clickedImage; // Use your Base64 string here

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoYXNhbnphaW51bDEwQGdtYWlsLmNvbSIsImlhdCI6MTcyODk1NTQ2MX0.CFOCdn1hHYX_zE8kjDq-6JkSuxdceOFzrXB82Q02K78',
        },
        body: JSON.stringify({
          model: 'meta-llama/Llama-3.2-90B-Vision-Instruct',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Create and X-ray report based on the following image' },
                {
                  type: 'image_url',
                  image_url: { url: 'data:image/jpeg;base64,' + base64Image },
                },
              ],
            },
          ],
          max_tokens: 2048,
          temperature: 0.7,
          top_p: 0.9,
          stream: false,
        }),
      });
      console.log('response', response);
      const json = await response.json();

      const output = json.choices[0].message.content;
      console.log(output);
    }
  };

  return (
    <>
      {renderHeader && (
        <>
          <PanelStudyBrowserHeader
            tab={tab}
            getCloseIcon={getCloseIcon}
            viewPresets={viewPresets}
            updateViewPresetValue={updateViewPresetValue}
            actionIcons={actionIcons}
            updateActionIconValue={updateActionIconValue}
          />
          <Separator
            orientation="horizontal"
            className="bg-black"
            thickness="2px"
          />
        </>
      )}
      <StudyBrowser
        tabs={tabs}
        servicesManager={servicesManager}
        activeTabName={activeTabName}
        onDoubleClickThumbnail={onDoubleClickThumbnailHandler}
        activeDisplaySetInstanceUIDs={activeDisplaySetInstanceUIDs}
        expandedStudyInstanceUIDs={expandedStudyInstanceUIDs}
        onClickStudy={_handleStudyClick}
        onClickTab={clickedTabName => {
          setActiveTabName(clickedTabName);
        }}
        showSettings={actionIcons.find(icon => icon.id === 'settings').value}
        viewPresets={viewPresets}
      />
      <div className="flex flex-col gap-4 text-xl font-bold">
        <Button onClick={handlePerformAIDiagnosis}>Perform AI Diagnosis</Button>
        <Button onClick={handlePerformAIReporting}>Perform AI Reporting</Button>
      </div>
    </>
  );
}

PanelStudyBrowserAi.propTypes = {
  servicesManager: PropTypes.object.isRequired,
  dataSource: PropTypes.shape({
    getImageIdsForDisplaySet: PropTypes.func.isRequired,
  }).isRequired,
  getImageSrc: PropTypes.func.isRequired,
  getStudiesForPatientByMRN: PropTypes.func.isRequired,
  requestDisplaySetCreationForStudy: PropTypes.func.isRequired,
};

export default PanelStudyBrowserAi;

/**
 * Maps from the DataSource's format to a naturalized object
 *
 * @param {*} studies
 */
function _mapDataSourceStudies(studies) {
  return studies.map(study => {
    // TODO: Why does the data source return in this format?
    return {
      AccessionNumber: study.accession,
      StudyDate: study.date,
      StudyDescription: study.description,
      NumInstances: study.instances,
      ModalitiesInStudy: study.modalities,
      PatientID: study.mrn,
      PatientName: study.patientName,
      StudyInstanceUID: study.studyInstanceUid,
      StudyTime: study.time,
    };
  });
}

function _mapDisplaySets(displaySets, thumbnailImageSrcMap) {
  const thumbnailDisplaySets = [];
  const thumbnailNoImageDisplaySets = [];

  displaySets
    .filter(ds => !ds.excludeFromThumbnailBrowser)
    .forEach(ds => {
      const imageSrc = thumbnailImageSrcMap[ds.displaySetInstanceUID];
      const componentType = _getComponentType(ds);

      const array =
        componentType === 'thumbnail' ? thumbnailDisplaySets : thumbnailNoImageDisplaySets;

      array.push({
        displaySetInstanceUID: ds.displaySetInstanceUID,
        description: ds.SeriesDescription || '',
        seriesNumber: ds.SeriesNumber,
        modality: ds.Modality,
        seriesDate: ds.SeriesDate,
        seriesTime: ds.SeriesTime,
        numInstances: ds.numImageFrames,
        countIcon: ds.countIcon,
        StudyInstanceUID: ds.StudyInstanceUID,
        messages: ds.messages,
        componentType,
        imageSrc,
        dragData: {
          type: 'displayset',
          displaySetInstanceUID: ds.displaySetInstanceUID,
          // .. Any other data to pass
        },
        isHydratedForDerivedDisplaySet: ds.isHydrated,
      });
    });

  return [...thumbnailDisplaySets, ...thumbnailNoImageDisplaySets];
}

const thumbnailNoImageModalities = ['SR', 'SEG', 'SM', 'RTSTRUCT', 'RTPLAN', 'RTDOSE'];

function _getComponentType(ds) {
  if (thumbnailNoImageModalities.includes(ds.Modality) || ds?.unsupported) {
    // TODO probably others.
    return 'thumbnailNoImage';
  }

  return 'thumbnail';
}
