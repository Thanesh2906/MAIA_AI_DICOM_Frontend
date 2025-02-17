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
import OpenAI from 'openai';
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
      // setClickedImage(imageId);

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
    const imageUrl = clickedImage + '?size=2048';
    console.log('Using enlarged image URL:', imageUrl);

    const base64Image: any = await convertImageToBase64(imageUrl);

    // Updated instructions without hairline fracture specificity
    const instructions = `Instructions:
    Generate a structured radiological report following this format:

    1. Patient Identification
       - Full Name: ${PatientName || 'Not available'}
       - MRN: ${PatientID || 'Not available'}
       - DOB: ${formatDate(PatientDOB) || 'Not available'}
       - Sex: ${PatientSex || 'Not specified'}

    2. Study type
       - [Imaging modality and projection - note image quality]

    3. Findings
       - [Detailed description of anatomical structures]
       - [Note any detected abnormalities or anomalies]
       - [Describe location and characteristics of findings]

    4. Impression
       - [Summary of significant findings]
       - [Clinical correlation if needed]

    5. Recommendations
       - [Suggest appropriate next steps based on findings]
       - [Follow-up timeline if required]

    6. Summary
       - [Concise overview of examination results]

    7. Normal/Abnormal
       - [Put normal if no issues, abnormal if detected issues]`;

    try {
      // Initialize OpenAI
      const openai = new OpenAI({
        apiKey:
          'xai-PRP9mLhkXN9gnhJ6cQqEyGmla4f5Sx6D3BdTzQBjapGM7HG3QKsnGWND7WmmpIBxWFYJYOQVsnowNbh7',
        dangerouslyAllowBrowser: true,
        baseURL: 'https://api.x.ai/v1',
      });

      // Create completion using OpenAI
      const completion = await openai.chat.completions.create({
        model: 'grok-2-vision-1212',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: base64Image, // Use base64 image here
                  detail: 'high',
                },
              },
              {
                type: 'text',
                text: instructions,
              },
            ],
          },
        ],
      });

      let output: string = completion.choices[0].message.content;
      output = output.replace(/\*/g, '').replace(/#/g, '').trim();
      const normalAbnormalMatch = output.match(/7\. Normal\/Abnormal\s*-\s*(\w+)/i);

      if (normalAbnormalMatch && normalAbnormalMatch[1]) {
        const normalAbnormalValue = normalAbnormalMatch[1];
        console.log('Normal/Abnormal Value:', normalAbnormalValue);
        if (normalAbnormalValue === 'normal' || normalAbnormalValue === 'Normal') {
          console.log('Reanalyzing with Groq...');
          const groq = new Groq({
            apiKey: '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',
            dangerouslyAllowBrowser: true,
          });

          // New request to Groq using the same parameters
          const base64Content = [
            {
              type: 'text',
              text: instructions,
            },
            {
              type: 'image_url',
              image_url: {
                url: base64Image as string,
              },
            },
          ];

          const fallbackResponse = await groq.chat.completions.create({
            messages: [
              {
                role: 'user',
                content: base64Content as ChatCompletionContentPart[],
              },
            ],
            model: 'llama-3.2-90b-vision-preview',
            temperature: 0.7,
            max_tokens: 2048,
            top_p: 0.9,
            stream: false,
            stop: null,
          });

          // Extract output from the fallback response
          let fallbackOutput = fallbackResponse.choices[0].message.content;
          fallbackOutput = output.replace(/\*/g, '').replace(/#/g, '').trim();
          const normalAbnormalMatch2 = output.match(/ Normal\/Abnormal\s*-\s*(\w+)/i);

          if (normalAbnormalMatch2 && normalAbnormalMatch2[1]) {
            const normalAbnormalValue2 = normalAbnormalMatch2[1];
            console.log('Normal/Abnormal Value:', normalAbnormalValue2);
            if (normalAbnormalValue2 === 'abnormal' || normalAbnormalValue2 === 'Abnormal') {
              output = fallbackOutput;
            }
          }
        } else {
          console.log('Normal/Abnormal section not found.');
        }
      }

      // Remove the Normal/Abnormal section before setting the report output
      output = output.replace(/7\. Normal\/Abnormal\s*-\s*\w+/i, '').trim();
      output = output.replace(/Normal\/Abnormal\s*-\s*\w+/i, '').trim();

      // Maintain existing formatting
      setReportOutput(output);

      uiNotificationService.show({
        title: 'Report Generated',
        message: 'Hairline fracture analysis complete',
        type: 'success',
        duration: 3000,
      });
    } catch (error) {
      console.error('OpenAI API Error:', error);
      // Add fallback handling if needed
    }
  };

  // Function to convert image URL to base64
  const convertImageToBase64 = async url => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Updated formatAnalysis function
  function formatAnalysis(text) {
    const sections = {
      Type: '',
      Findings: '',
      Impression: '',
      Recommendations: '',
      Summary: '',
    };

    let currentSection = null;
    const sectionPattern =
      /^\d*\.?\s*(Patient Identification|Type|Study Type|Findings|Impression|Recommendations|Summary)[\s:-]*/i;

    // Add pattern to match radiologist signature lines
    const radiologistPattern = /^-{3}\s*Radiologist:\s*\[.*\]\s*Date:\s*\[.*\]/i;

    text.split('\n').forEach(line => {
      line = line
        .replace(/\*\*/g, '')
        .replace(/\*/g, '•')
        .replace(/•+/g, '•')
        .replace(/_/g, '')
        .replace(/---/g, '')
        .replace(/#/g, '')
        .trim();

      // Skip radiologist signature lines
      if (radiologistPattern.test(line)) {
        return; // Skip this line entirely
      }

      // Handle section detection
      const sectionMatch = line.match(sectionPattern);
      if (sectionMatch) {
        const rawSection = sectionMatch[1].trim();
        currentSection =
          rawSection.toLowerCase() === 'patient identification' ? 'Study type' : rawSection;

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

      // Updated findings description
      if (currentSection === 'Findings') {
        line = line
          .replace(/hairline fracture/gi, 'abnormality') // Replace specific terms
          .replace(/fracture/gi, 'abnormality');
      }
    });

    // Post-process formatting
    for (const [key, value] of Object.entries(sections)) {
      sections[key] = value
        .replace(/hairline fracture/gi, 'abnormality')
        .replace(/fracture/gi, 'abnormality')
        .replace(/CT scan/gi, 'further imaging') // Replace specific recommendations
        .replace(/(\n•)/g, '\n• ')
        .replace(/\s+/g, ' ')
        .trim();

      // Special handling for Type
      if (key === 'Type') {
        sections[key] = sections[key]
          .replace(/Patient(_| )?[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/gi, '')
          .replace(/(Name|MRN|DOB|Sex):\s*.*/g, '')
          .replace(/%¸/g, '')
          .trim();

        if (!sections[key]) {
          const studyTypeMatch = text.match(/(Study Type|Type|Modality)[\s:-]*(.+?)(\.|\n|$)/i);
          sections[key] = studyTypeMatch?.[2] || 'Radiographic examination not specified';
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
    let y = 28; // Start lower to account for header
    const lineHeight = 6;
    const primaryColor = '#2B5797'; // Microsoft blue color
    const reportDate = new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
      doc.setFontSize(9);
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
      { text: `Name: ${PatientName || 'Not available'}`, style: 'patientInfo' },
      { text: `MRN: ${PatientID || 'Not available'}`, style: 'patientInfo' },
      { text: `DOB: ${formatDate(PatientDOB) || 'Not available'}`, style: 'patientInfo' },
      { text: `Sex: ${PatientSex || 'Not specified'}`, style: 'patientInfo' },
      '',
      { text: 'Type', style: 'sectionHeader' },
      ...(sections['Type']
        ?.split('\n')
        .filter(
          l =>
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
      ...(sections['Summary']?.split('\n') || ['No summary available']),
    ];

    // Process content
    formattedContent.forEach((item, index) => {
      if (y > doc.internal.pageSize.getHeight() - 30) {
        addFooter();
        doc.addPage();
        y = 30;
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
          y += lineHeight * 1.1;
          return;
        }
        if (item.style === 'patientInfo') {
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0);

          const splitText = doc.splitTextToSize(item.text, pageWidth - sideMargin * 2);
          splitText.forEach((line, lineIndex) => {
            doc.text(line, sideMargin, y + lineIndex * lineHeight);
          });
          y += splitText.length * lineHeight * 0.9;
          return;
        }
      }

      if (typeof item === 'string') {
        if (item === '') {
          y += lineHeight * 0.4;
          return;
        }

        // Remove bullet points for patient information
        const isPatientInfo =
          item.startsWith('Name:') ||
          item.startsWith('MRN:') ||
          item.startsWith('Date of Birth:') ||
          item.startsWith('Sex:');

        doc.setFontSize(11);
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

    // Ensure footer is added to the final page
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
      const response = await axios.get(
        `https://maiabe-h7h6bndqegdjbyfr.westus2-01.azurewebsites.net/result/${instance_id}?size=2048`
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
                <Button onClick={onContinue}>{isGenerating ? 'Analyzing...' : 'Generate'}</Button>
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
  return studies.map(study => ({
    AccessionNumber: study.accession,
    StudyDate: study.date,
    StudyDescription: study.description,
    NumInstances: study.instances,
    ModalitiesInStudy: study.modalities,
    PatientID: study.mrn || study.PatientID,
    PatientName: study.patientName || study.PatientName,
    StudyInstanceUID: study.studyInstanceUid,
    StudyTime: study.time,
    PatientDOB: study.PatientBirthDate || 'Unknown',
    PatientSex: study.PatientSex || 'U',
  }));
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
