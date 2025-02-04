/* eslint-disable no-template-curly-in-string */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useImageViewer, useViewportGrid } from '@ohif/ui';
import { StudyBrowser as NewStudyBrowser, Popover } from '@ohif/ui-next';
import { StudyBrowser as OldStudyBrowser } from '@ohif/ui';
import { utils, DicomMetadataStore, DisplaySetService } from '@ohif/core';
import { useAppConfig } from '@state';
import { useNavigate } from 'react-router-dom';
import { Separator } from '@ohif/ui-next';
import { PanelStudyBrowserHeader } from './PanelStudyBrowserHeader';
import { defaultActionIcons, defaultViewPresets } from './constants';
import { Button } from '@ohif/ui';
import { useAppContext } from '../../../../../platform/app/src/AppContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../../../component/alert-dialog';
import { Textarea } from '../../../../../component/textarea';
import jsPDF from 'jspdf';
import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import dcmjs from 'dcmjs';
import Groq from 'groq-sdk';
import { ChatCompletionContentPart } from 'groq-sdk/resources/chat/completions';

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
  const { blobUrl, setBlobUrl, setBlobbing, patientInfo } = useAppContext();
  const { PatientName, PatientID, PatientSex, PatientDOB } = patientInfo;
  const [reportOutput, setReportOutput] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [detectionLabel, setdetectionLabel] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [iid, setIid] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  console.log('patientInfo', patientInfo);

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
      console.log('image ids: ');
      const imageId = imageIds[0];
      setIid(imageId);
      console.log('imageId', imageId);
      setClickedImage(imageId);

      const sopInstanceUID = await getSOPInstanceUID(imageId);
      console.log('sopInstanceUID', sopInstanceUID);
      const instanceId: string = await getInstanceIdBySOPInstanceUID(
        'http://orthanc.zairiz.com:8042/',
        sopInstanceUID
      );

      if (instanceId) {
        const url = 'http://orthanc.zairiz.com:8042/instances/' + instanceId + '/frames/0/rendered';
        console.log('url: ', url);

        setClickedImage(url);
      }
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

  useEffect(() => {
    setBlobbing(false);
  }, []);

  const getSOPInstanceUID = (imageId: string) => {
    // Access a loaded study's metadata
    try {
      const instance = DicomMetadataStore.getInstanceByImageId(imageId);
      console.log(instance);
      console.log(instance.SOPInstanceUID);
      const result: string = instance.SOPInstanceUID;
      return result;
    } catch {
      try {
        const instance = DicomMetadataStore.getInstanceByImageId(imageId);
        console.log(instance);
        console.log(instance.SOPInstanceUID);
        const result: string = instance.SOPInstanceUID;
        return result;
      } catch {
        console.log(`No instance found`);
      }
    }
  };

  const getInstanceIdBySOPInstanceUID = async (
    orthancUrl: string,
    sopInstanceUID: string
  ): Promise<string | null> => {
    try {
      // Fetch all instances
      const instancesResponse = await axios.get(`${orthancUrl}/instances`);
      console.log('instanceResponse:', instancesResponse.data);

      // Check if instances were found
      if (instancesResponse.data && instancesResponse.data.length > 0) {
        // Iterate over the instances
        for (const instance of instancesResponse.data) {
          // Fetch details for each instance
          const instanceDetailsResponse = await axios.get(`${orthancUrl}/instances/${instance}`);

          // Check if SOPInstanceUID matches
          if (
            instanceDetailsResponse.data &&
            instanceDetailsResponse.data.MainDicomTags.SOPInstanceUID === sopInstanceUID
          ) {
            return instance; // Return the matching instance ID
          }
        }
        console.log('No matching instance found for the given SOPInstanceUID.');
        return null;
      } else {
        console.log('No instances found in the Orthanc server.');
        return null;
      }
    } catch (error) {
      console.error('Error fetching instances:', error);
      return null;
    }
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

  // // ~~ Initial Thumbnailsb
  useEffect(() => {
    console.log('hasLoadedViewports useEffect');

    if (!hasLoadedViewports) {
      if (activeViewportId) {
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

    // TODO: Are we sure activeDisplaySets will always be accurate?
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
          setIid(imageId);
          console.log('imageIds', imageIds);

          // TODO: Is it okay that imageIds are not returned here for SR displaysets?
          if (!imageId) {
            return;
          }

          const sopInstanceUID = await getSOPInstanceUID(imageId);
          console.log('sopInstanceUID', sopInstanceUID);
          const instanceId: string = await getInstanceIdBySOPInstanceUID(
            'http://orthanc.zairiz.com:8042/',
            sopInstanceUID
          );
          if (instanceId) {
            const url =
              'http://orthanc.zairiz.com:8042/instances/' + instanceId + '/frames/0/rendered';

            setClickedImage(url);
          }
          // When the image arrives, render it and store the result in the thumbnailImgSrcMap
          newImageSrcEntry[dSet.displaySetInstanceUID] = await getImageSrc(
            imageId,
            dSet.initialViewport
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
    // TODO: Will this always hold all the displaySets we care about?
    // DISPLAY_SETS_CHANGED returns DisplaySerService.activeDisplaySets
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
      setIsAiGenerating(true);
      // Ensure clickedImage is available
      if (!clickedImage) {
        console.warn('No image clicked to perform diagnosis.');
        return;
      }

      // Prepare the POST request
      const response = await fetch(
        'https://maiabe-h7h6bndqegdjbyfr.westus2-01.azurewebsites.net/detect',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_url: clickedImage, // Base64 image string
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
      const blob = result.detection_image; // Adjust MIME type if necessary
      setdetectionLabel(result.detection_label);

      console.log('blob', blob);
      setBlobUrl(blob);
      setBlobbing(true);
      setIsAiGenerating(false);

      // viewportGridService.setDisplaySetsForViewports(blob);
    } catch (error) {
      console.error('Error performing AI diagnosis:', error);
      setIsAiGenerating(false);
    }
  };

  // Helper function: Check if an image URL is accessible
  const validateImageUrl = (url: string): Promise<boolean> => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  };

  const handlePerformAIReporting = async () => {
    const groq = new Groq({
      apiKey: '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',
      dangerouslyAllowBrowser: true,
    });

    if (clickedImage) {
      console.log('clickedImage:', clickedImage);

      // Use clickedImage as the initial image URL (changed from const to let so we can update it)
      let imageUrl = clickedImage;
      console.log('Using imageUrl:', imageUrl);

      // Validate the image URL before proceeding.
      const isAccessible = await validateImageUrl(imageUrl);
      if (!isAccessible) {
        console.error('Image is not accessible. Original URL:', imageUrl);

        // Attempt fallback with blobUrl, if available
        if (blobUrl) {
          imageUrl = 'data:image/jpeg;base64,' + blobUrl;
          console.log('Fallback to blobUrl:', imageUrl);
          // No further validation is needed for a Base64 inline image.
        } else {
          console.error('No fallback image available. Aborting AI Reporting.');
          // Optionally, you can notify the user here.
          return;
        }
      }

      const instructions: string = `Instructions:
Generate a radiological report from the provided X-ray image and patient data. The report must follow the numbered format below, using numbers for sections and a dash "-" before each field item:

1. Patient Identification
   - Full Name: [Patient's Full Name]
   - Age/Gender: [e.g., 62/F]
   - MRN Number: [Unique Hospital MRN, e.g., MRN-123456]
   - Date/Time of X-ray: [DD/MM/YYYY HH:MM]

2. Clinical Information
   - Referring Physician: [Name/Department]
   - Clinical Indication: [e.g., "Suspected pneumonia," "Trauma post-fall"]
   - Relevant History: [e.g., "Diabetic, smoker, 2-week history of cough"]

3. Technical Details
   - X-ray Type/Projection: [e.g., "Chest PA view," "AP/Lateral ankle"]
   - Radiation Dose (if documented): [e.g., "DAP: 0.8 Gy·cm²"]

4. Findings (Systematic Description)
   - Provide a systematic description in anatomical order.
     Example:
       - Normal: "No acute fracture or dislocation. Lung fields are clear."
       - Abnormal: "Comminuted fracture of the left tibial shaft with 5mm displacement."

5. Impression
   - Summarize the most significant findings.
   - If applicable, link the findings to relevant CPG criteria.

6. Recommendations
   - Suggest next steps or further investigations per CPG guidelines.
   - Include any safety or urgency notes (if necessary).

7. Reporting Details
   - Radiologist's Name & Credentials:
   - Verification Note:
   - Disclaimer:

Use the provided patient data and image for context:
Patient Name: ${patientInfo.PatientName}
Patient Date of Birth: ${patientInfo.PatientDOB}
Patient Sex: ${patientInfo.PatientSex}
Short Diagnosis: ${detectionLabel}`;

      const content = [
        {
          type: 'text',
          text: instructions,
        },
        {
          type: 'image_url',
          image_url: {
            url: imageUrl,
          },
        },
      ];

      try {
        const response = await groq.chat.completions.create({
          messages: [
            {
              role: 'user',
              content: content as ChatCompletionContentPart[],
            },
          ],
          model: 'llama-3.2-90b-vision-preview',
          temperature: 0.7,
          max_tokens: 2048,
          top_p: 0.9,
          stream: false,
          stop: null,
        });
        console.log('response', response);
        const json = response;
        // Remove asterisks and trim whitespace from output
        const output = json.choices[0].message.content.replace(/\*/g, '').trim();
        setReportOutput(output);
        console.log(output);
      } catch (error) {
        console.error('Error in AI Reporting:', error);
      }
    }
  };

  const onContinue = async () => {
    // {{ edit_2 }}
    setIsGenerating(true); // Start generating
    await handlePerformAIReporting(); // Wait for the report to be generated
    setIsGenerating(false); // Stop generating
  };
  const closeDialog = () => {
    setIsDialogOpen(false); // Function to close the dialog
  };

  const handleDownloadPDF = () => {
    // Create a jsPDF instance with orientation, unit, and format explicitly defined.
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const sideMargin = 20; // Margin for both left and right sides
    let y = 10;
    const lineHeight = 7;

    // Use the reportOutput content or fall back to a default message.
    const reportContent = reportOutput || 'No report available';
    // Split the content by newline characters.
    const lines = reportContent.split('\n');

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine === '') {
        // Add extra spacing for an empty line.
        y += lineHeight;
        return;
      }

      // Special handling for the title.
      if (trimmedLine === 'Radiological Report') {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(18);
        doc.text(trimmedLine, pageWidth / 2, y, { align: 'center' });
        y += lineHeight;
        return;
      }

      // For every line with a colon, split into key and value parts.
      if (trimmedLine.includes(':')) {
        const colonIndex = trimmedLine.indexOf(':');
        const keyPart = trimmedLine.substring(0, colonIndex + 1); // includes the colon
        const valuePart = trimmedLine.substring(colonIndex + 1).trim();

        // Print the key in bold.
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(keyPart, sideMargin, y);
        const keyWidth = doc.getTextWidth(keyPart);

        // Setup the available width then wrap the value text accordingly.
        doc.setFont('Helvetica', 'normal');
        const availableWidth = pageWidth - sideMargin * 2 - keyWidth;
        const textLines = doc.splitTextToSize(valuePart, availableWidth);
        doc.text(textLines, sideMargin + keyWidth, y);

        // Increment y based on the number of lines used by the value.
        y += textLines.length * lineHeight;
      } else {
        // For lines that do not contain a colon, render the text normally.
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(12);
        const textLines = doc.splitTextToSize(trimmedLine, pageWidth - sideMargin * 2);
        doc.text(textLines, sideMargin, y);
        y += textLines.length * lineHeight;
      }

      // Add a new page if y exceeds the page height limits.
      if (y > doc.internal.pageSize.getHeight() - sideMargin) {
        doc.addPage();
        y = 10;
      }
    });

    // Save the generated PDF document.
    doc.save('patient_report.pdf');
  };

  const handleSaveReport = async () => {
    console.log(StudyInstanceUIDs);
    const input1: string = StudyInstanceUIDs[0]; // Patient ID
    const sopInstanceUID = await getSOPInstanceUID(iid);
    console.log('sopInstanceUID', sopInstanceUID);
    const instance_id: string = await getInstanceIdBySOPInstanceUID(
      'http://orthanc.zairiz.com:8042/',
      sopInstanceUID
    );
    console.log('input1: ', input1);
    console.log('instance_id: ', instance_id);

    // Prepare the report data as a Blob from the string
    const reportText = reportOutput || 'No report available.'; // Use the report output or a default message

    try {
      const response = await axios.post(
        `https://maiabe-h7h6bndqegdjbyfr.westus2-01.azurewebsites.net/report`, // Update with your actual API URL
        null, // No body needed since we're using query parameters
        {
          params: {
            instance_id: instance_id,
            report: reportText,
          },
        }
      );

      console.log('Response: ', response);
      console.log('Report saved to database');
    } catch (error) {
      console.error('Error saving report:', error.message);
    }
  };

  const fetchReport = async (instance_id: string) => {
    try {
      // Fetch the report data from the DICOM instance attachments
      const response = await axios.get(
        `https://maiabe-h7h6bndqegdjbyfr.westus2-01.azurewebsites.net/report/${instance_id}` // Updated endpoint to fetch the specific attachment
      );

      // Extract the report data from the response
      const reportData = response.data;
      console.log('Fetched report data:', reportData);

      // Check if the report data exists
      if (reportData) {
        console.log('Report Output:', reportData);
        setReportOutput(reportData.report); // Set the report output state
        return reportData.report;
      } else {
        console.log('No report data found in the specified attachment.');
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
    }
  };

  useEffect(() => {
    const loadReport = async () => {
      const sopInstanceUID = await getSOPInstanceUID(iid);
      const instanceId: string = await getInstanceIdBySOPInstanceUID(
        'http://orthanc.zairiz.com:8042/',
        sopInstanceUID
      );

      if (instanceId) {
        const report = await fetchReport(instanceId); // Fetch the report
        if (report) {
          setReportOutput(report); // Set the report output state
        } else {
          console.log('No report found for this instance.');
        }
      }
    };

    loadReport(); // Call the loadReport function
  }, [iid]); // Add dependencies as needed

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
        <Button
          onClick={handlePerformAIDiagnosis}
          disabled={isAiGenerating}
        >
          {isAiGenerating ? 'AI Performing...' : 'Perform AI Diagnosis'}
        </Button>
        <AlertDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
        >
          <AlertDialogTrigger>
            <Button className="w-5/6 rounded-md pr-6">Perform AI Reporting</Button>
          </AlertDialogTrigger>
          {currentPage === 0 ? (
            <AlertDialogContent className="max-w-[850px]">
              <AlertDialogHeader>
                <AlertDialogDescription>
                  <div className="relative space-y-2 text-2xl">
                    <p className="text-3xl">Patient Report Information</p>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <label>Patient Name:</label>
                        <input
                          value={PatientName}
                          className="col-span-2"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <label>Patient ID:</label>
                        <input
                          value={PatientID}
                          className="col-span-2"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <label>Date of Birth:</label>
                        <input
                          value={PatientDOB}
                          className="col-span-2"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <label>Sex:</label>
                        <input
                          value={PatientSex}
                          className="col-span-2"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <label>Short Diagnosis:</label>
                        <input
                          value={detectionLabel}
                          onChange={e => setdetectionLabel(e.target.value)}
                          className="col-span-2"
                        />
                      </div>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <Button onClick={closeDialog}>Cancel</Button>
                <Button onClick={onContinue}>{isGenerating ? 'Generating...' : 'Generate'}</Button>
                <Button
                  disabled={!reportOutput}
                  onClick={() => setCurrentPage(1)}
                >
                  View Report
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          ) : (
            <AlertDialogContent className="max-w-[1150px] space-y-2">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-xl text-white">Patient Report</AlertDialogTitle>
                <AlertDialogDescription>
                  <div>
                    <Textarea
                      className="h-[680px] border-white text-lg text-white"
                      value={reportOutput} // {{ edit_2 }}
                      onChange={e => setReportOutput(e.target.value)} // {{ edit_3 }}
                    />
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <Button onClick={() => setCurrentPage(0)}>Back</Button>
                <Button onClick={handleDownloadPDF}>Download as PDF</Button>
                <Button onClick={handleSaveReport}>Save Report</Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          )}
        </AlertDialog>
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
