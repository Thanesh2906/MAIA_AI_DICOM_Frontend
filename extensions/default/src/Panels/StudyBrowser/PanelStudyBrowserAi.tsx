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
        try {
          fetchResult(instanceId);
        } catch (error) {
          setClickedImage(url);
        }
      }

      // Show a notification for the action
      uiNotificationService.show({
        title: 'Thumbnail Selected',
        message: 'The thumbnail has been successfully selected.',
        type: 'success',
        duration: 3000,
      });
    } catch (error) {
      console.warn(error);
      uiNotificationService.show({
        title: 'Thumbnail Double Click',
        message: 'The selected display sets could not be added to the viewport.',
        type: 'error',
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
        uiNotificationService.show({
          title: 'No Image Selected',
          message: 'Please select an image to perform diagnosis.',
          type: 'warning',
          duration: 3000,
        });
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
            image_url: clickedImage,
            image_id: '123',
            overall_confidence_level: 0.3,
            overlap_confidence_level: 0.3,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Diagnosis Result:', result);
      const blob = result.detection_image; // Adjust MIME type if necessary
      setdetectionLabel(result.detection_label);

      console.log('blob', blob);
      setBlobUrl(blob);
      setBlobbing(true);
      setIsAiGenerating(false);

      // Show success notification
      uiNotificationService.show({
        title: 'AI Diagnosis Complete',
        message: 'The AI diagnosis has been successfully performed.',
        type: 'success',
        duration: 3000,
      });
    } catch (error) {
      console.error('Error performing AI diagnosis:', error);
      uiNotificationService.show({
        title: 'AI Diagnosis Error',
        message: 'An error occurred while performing AI diagnosis.',
        type: 'error',
        duration: 3000,
      });
    } finally {
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

      const imageUrl = clickedImage;
      console.log('Using imageUrl:', imageUrl);

      const instructions: string = `Instructions:
Generate a structured radiological report from the provided X-ray image and patient data. Use this exact format:

1. Patient Identification
   - Full Name: [Patient's Full Name]
   - Age/Gender: [Calculated Age]/[Patient Sex]
   - MRN Number: [Patient ID]
   - Date/Time of X-ray: [Current Date/Time in DD/MM/YYYY HH:MM format]

2. Study type
   - [Imaging modality and projection]

3. Findings
   - [Systematic description of findings]
   - [Relevant anatomical observations]

4. Impression
   - [Concise summary of key findings]
   - [Clinical correlation if applicable]

5. Recommendations
   - [Specific next steps or follow-up suggestions]

6. Summary
   - [Brief overall assessment in 2-3 sentences]

Base this on the patient data:
Name: ${patientInfo.PatientName}
DOB: ${patientInfo.PatientDOB}
Sex: ${patientInfo.PatientSex}
Initial AI Detection: ${detectionLabel}`;

      const content = [
        {
          type: 'text',
          text: `Analyze this medical image and generate a structured report using ONLY these sections:
            1. Patient Identification
            2. Study type
            3. Findings
            4. Impression
            5. Recommendations
            6. Summary

            Patient Data:
            Name: ${patientInfo.PatientName}
            DOB: ${patientInfo.PatientDOB}
            Sex: ${patientInfo.PatientSex}`
        },
        {
          type: 'image_url',
          image_url: {
            url: imageUrl,
          },
        },
      ];

      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      const maxRetries = 3;
      let retryCount = 0;

      while (retryCount < maxRetries) {
        try {
        const response = await groq.chat.completions.create({
          messages: [
            {
              role: 'user',
              content: content as ChatCompletionContentPart[],
            },
          ],
          model: 'llama-3.2-90b-vision-preview',
          temperature: 0.1,
          max_tokens: 2048,
          top_p: 0.9,
          stream: false,
          stop: null,
        });

        const output = response.choices[0].message.content.replace(/\*/g, '').trim();
          setReportOutput(output);
          console.log('Groq output:', output);

        uiNotificationService.show({
          title: 'Report Generated',
          message: 'Report successfully generated using Groq API.',
          type: 'success',
          duration: 3000,
        });
        return;
      } catch (error) {
          console.error(`Groq API attempt ${retryCount + 1} failed:`, error);

          if (error.message?.includes('429') || error.response?.status === 429) {
            retryCount++;
            if (retryCount < maxRetries) {
              const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
              console.log(`Rate limited. Waiting ${waitTime}ms before retry...`);
              await delay(waitTime);
              continue;
            }
          } else {
            // If it's not a rate limit error, break immediately
            break;
          }
        }
      }

      // If we're here, Groq API failed all retries or had a non-rate-limit error
      console.log('Falling back to Groq API with base64 image...');

        try {
          const response = await fetch(clickedImage);
          const blob = await response.blob();
          const base64Image = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });

          const base64Content = [
            {
              type: 'text',
              text: `Analyze this medical image and generate a structured report using ONLY these sections:
              1. Patient Identification
              2. Study type
              3. Findings
              4. Impression
              5. Recommendations
              6. Summary

              Patient Data:
              Name: ${patientInfo.PatientName}
              DOB: ${patientInfo.PatientDOB}
              Sex: ${patientInfo.PatientSex}`

            },
            {
              type: 'image_url',
              image_url: {
                url: base64Image as string,
              }
            }
          ];

          const fallbackResponse = await groq.chat.completions.create({
            messages: [
              {
                role: 'user',
                content: base64Content as ChatCompletionContentPart[],
              },
            ],
            model: 'llama-3.2-90b-vision-preview',
            temperature: 0.1,
            max_tokens: 2048,
            top_p: 0.9,
            stream: false,
            stop: null,
          });

        const fallbackOutput = fallbackResponse.choices[0].message.content
          .replace(/\*/g, '')
          .trim();
        setReportOutput(fallbackOutput);
        console.log('Fallback Groq output:', fallbackOutput);

          uiNotificationService.show({
            title: 'Report Generated',
            message: 'Report successfully generated using fallback method.',
            type: 'success',
            duration: 3000,
          });
        } catch (fallbackError) {
          console.error('Both API attempts failed:', fallbackError);
          uiNotificationService.show({
            title: 'Report Generation Failed',
            message: 'Failed to generate report using both primary and fallback methods.',
            type: 'error',
            duration: 5000,
          });
        }
    }
  };

  // Updated formatAnalysis function
  function formatAnalysis(text) {
    const sections = {
      'Study type': '',
      'Findings': '',
      'Impression': '',
      'Recommendations': '',
      'Summary': ''
    };

    let currentSection = null;
    // Improved regex to handle numbered sections and different separators
    const sectionPattern = /^\d*\.?\s*(Patient Identification|Study Type|Findings|Impression|Recommendations|Summary)[\s:-]*/i;

    text.split('\n').forEach(line => {
      line = line
        .replace(/\*\*/g, '')
        .replace(/\*/g, '•')
        .replace(/•+/g, '•')
        .replace(/_/g, '')
        .trim();

      // Handle section detection
      const sectionMatch = line.match(sectionPattern);
      if (sectionMatch) {
        const rawSection = sectionMatch[1].trim();
        currentSection = rawSection.toLowerCase() === 'patient identification'
          ? 'Study type'
          : rawSection;

        // Remove the entire matched section header from the line
        line = line.replace(sectionMatch[0], '').trim();
      }

      if (currentSection) {
        // Clean up any remaining section markers
        line = line.replace(/^(•|\d\.)\s*/, '').trim();

        if (line.length > 0) {
          sections[currentSection] += `${line}\n`;
        }
      }
    });

    // Post-process formatting
    for (const [key, value] of Object.entries(sections)) {
      sections[key] = value
        .replace(/(\n•)/g, '\n• ')
        .replace(/\s+/g, ' ')
        .trim();

      // Special handling for Study type
      if (key === 'Study type') {
        sections[key] = sections[key]
          .replace(/Patient(_| )?[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/gi, '')
          .replace(/(Name|MRN|DOB|Sex):\s*.*/g, '') // Remove entire patient info lines
          .replace(/%¸/g, '')
          .trim();

        // Directly extract study type from original text if empty
        if (!sections[key]) {
          const studyTypeMatch = text.match(/Study Type[\s:-]*(.+?)(\.|\n|$)/i);
          sections[key] = studyTypeMatch?.[1] || 'Radiographic examination not specified';
        }
      }
    }

    return sections;
  }

  // Helper function to fallback to original text if study type not detected
  function extractStudyTypeFromReport(text) {
    const studyTypePattern = /(Study Type|Modality|Imaging Technique):?\s*([^\n]+)/i;
    const match = text.match(studyTypePattern);
    return match ? match[2].trim() : 'Not specified (Fallback detection)';
  }

  const onContinue = async () => {
    // Notify user that report generation is starting
    uiNotificationService.show({
      title: 'Generating Report',
      message: 'Please wait while the report is being generated.',
      type: 'info',
      duration: 3000,
    });

    setIsGenerating(true); // Start generating
    await handlePerformAIReporting(); // Wait for the report to be generated
    setIsGenerating(false); // Stop generating

    // Notify user that report generation is complete
    uiNotificationService.show({
      title: 'Report Generated',
      message: 'The report has been successfully generated.',
      type: 'success',
      duration: 3000,
    });
  };
  const closeDialog = () => {
    setIsDialogOpen(false); // Function to close the dialog
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const sideMargin = 20;
    let y = 30; // Start lower to account for header
    const lineHeight = 7;
    const primaryColor = '#2B5797'; // Microsoft blue color
    const reportDate = new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Add header on first page
    doc.setFillColor(primaryColor);
    doc.rect(0, 0, pageWidth, 20, 'F');
    doc.setFontSize(18);
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.text('MAIA AI Radiological Report', sideMargin, 12);
    doc.setFontSize(10);
    doc.text(`Report Date/Time: ${reportDate}`, sideMargin, 18);

    // Add footer function
    const addFooter = () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setDrawColor(primaryColor);
      doc.setLineWidth(0.5);
      doc.line(sideMargin, pageHeight - 20, pageWidth - sideMargin, pageHeight - 20);
      doc.setTextColor(primaryColor);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const footerText = 'MAIA Sdn Bhd | AI Medical Imaging | www.maia.com.my';
      const textWidth = doc.getTextWidth(footerText);
      doc.text(footerText, (pageWidth - textWidth) / 2, pageHeight - 15);
    };

    // Reset styling for content
    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    const reportContent = reportOutput || 'No report available';
    const sections = formatAnalysis(reportContent);

    // Create formatted content
    const formattedContent = [
      '',
      { text: 'Patient Information', style: 'sectionHeader' },
      { text: `Name: ${PatientName}`, style: 'patientInfo' },
      { text: `MRN: ${PatientID}`, style: 'patientInfo' },
      { text: `DOB: ${PatientDOB}`, style: 'patientInfo' },
      { text: `Sex: ${PatientSex}`, style: 'patientInfo' },
      '',
      { text: 'Study Type', style: 'sectionHeader' },
      ...(sections['Study type']?.split('\n').filter(l =>
        !l.match(/Patient(_| )?[\w-]{36}/i) &&
        !l.match(/(Name|MRN|DOB|Sex):/) &&
        l.trim().length > 0
      ) || ['Radiographic examination not specified']),
      '',
      { text: 'Findings', style: 'sectionHeader' },
      ...(sections['Findings']?.split('\n') || ['No significant findings']),
      '',
      { text: 'Impression', style: 'sectionHeader' },
      ...(sections['Impression']?.split('\n') || ['No impression available']),
      '',
      { text: 'Recommendations', style: 'sectionHeader' },
      ...(sections['Recommendations']?.split('\n') || ['No recommendations']),
      '',
      { text: 'Summary', style: 'sectionHeader' },
      ...(sections['Summary']?.split('\n') || ['No summary available'])
    ];

    // Process content
    formattedContent.forEach((item, index) => {
      if (y > doc.internal.pageSize.getHeight() - 40) {
        addFooter();
        doc.addPage();
        y = 30; // Reset Y position and add new header
        doc.setFillColor(primaryColor);
        doc.rect(0, 0, pageWidth, 20, 'F');
        doc.setTextColor(255);
        doc.setFontSize(18);
        doc.text('MAIA AI Radiological Report', sideMargin, 12);
        doc.setFontSize(10);
        doc.text(`Report Date/Time: ${reportDate}`, sideMargin, 18);
        doc.setTextColor(0);
      }

      if (typeof item === 'object') {
        if (item.style === 'header') {
          doc.setFontSize(16);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(primaryColor);
          doc.text(item.text, sideMargin, y);
          y += lineHeight * 1.5;
          return;
        }
        if (item.style === 'sectionHeader') {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(primaryColor);
          doc.text(item.text, sideMargin, y);
          y += lineHeight * 1.2;
          return;
        }
        if (item.style === 'patientInfo') {
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0);

          const splitText = doc.splitTextToSize(item.text, pageWidth - sideMargin * 2);
          splitText.forEach((line, lineIndex) => {
            doc.text(line, sideMargin, y + lineIndex * lineHeight);
          });
          y += splitText.length * lineHeight;
          return;
        }
      }

      if (typeof item === 'string') {
        if (item === '') {
          y += lineHeight / 2;
          return;
        }

        // Remove bullet points for patient information
        const isPatientInfo = item.startsWith('Name:') ||
                             item.startsWith('MRN:') ||
                             item.startsWith('Date of Birth:') ||
                             item.startsWith('Sex:');

        doc.setFontSize(12);
        doc.setFont('helvetica', isPatientInfo ? 'bold' : 'normal');
        doc.setTextColor(0);

        // Process text without bullets for patient info
        const text = item.replace(/^•\s*/, '');
        const splitText = doc.splitTextToSize(text, pageWidth - sideMargin * 2);

        splitText.forEach((line, lineIndex) => {
          doc.text(line, sideMargin, y + lineIndex * lineHeight);
        });

        y += splitText.length * lineHeight;
      }
    });

    addFooter();
    doc.save('maia_radiology_report.pdf');

    uiNotificationService.show({
      title: 'PDF Downloaded',
      message: 'The report has been successfully downloaded as a PDF.',
      type: 'success',
      duration: 3000,
    });
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
        `https://maiabe-h7h6bndqegdjbyfr.westus2-01.azurewebsites.net/report`,
        null,
        {
          params: {
            instance_id: instance_id,
            report: reportText,
          },
        }
      );

      uiNotificationService.show({
        title: 'Report Saved',
        message: 'The report has been successfully saved to the database.',
        type: 'success',
        duration: 3000,
      });
    } catch (error) {
      console.error('Error saving report:', error.message);
      uiNotificationService.show({
        title: 'Save Report Error',
        message: 'An error occurred while saving the report.',
        type: 'error',
        duration: 3000,
      });
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

  const fetchResult = async (instance_id: string) => {
    try {
      // Fetch the report data from the DICOM instance attachments
      const response = await axios.get(
        `https://maiabe-h7h6bndqegdjbyfr.westus2-01.azurewebsites.net/result/${instance_id}` // Updated endpoint to fetch the specific attachment
      );

      // Extract the report data from the response
      const resultData = response.data;
      console.log('Fetched report data:', resultData);

      // Check if the report data exists
      if (resultData) {
        console.log('Fetched result:', resultData);
        const blob = resultData.detection_image; // Adjust MIME type if necessary
        setdetectionLabel(resultData.detection_label);

        console.log('blob', blob);
        setBlobUrl(blob);
        setBlobbing(true);
        setIsAiGenerating(false);
        return resultData.detection_image;
      } else {
        console.log('No result data found in the specified attachment.');
      }
    } catch (error) {
      console.error('Error fetching result data:', error);
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
                      value={reportOutput}
                      onChange={e => setReportOutput(e.target.value)}
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
