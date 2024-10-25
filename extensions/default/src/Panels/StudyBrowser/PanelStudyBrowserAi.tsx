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
      const imageId = imageIds[Math.floor(imageIds.length / 2)];
      setIid(imageId);
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

  async function getDicomMetadata(instanceId: string) {
    try {
      const response = await axios.get(
        `http://orthanc.zairiz.com:8042/instances/${instanceId}/content`,
        {
          auth: {
            username: 'orthanc',
            password: 'orthanc',
          },
        }
      );

      console.log('DICOM metadata retrieved successfully.');
      return response.data;
    } catch (error) {
      console.error('Error retrieving DICOM metadata:', error);
      return null;
    }
  }

  // Function to download a DICOM instance from Orthanc
  async function downloadDicomFromOrthanc(instanceId: string, outputFilePath: string) {
    try {
      const response = await axios({
        method: 'GET',
        url: `http://orthanc.zairiz.com:8042/instances/${instanceId}/file`,
        responseType: 'blob',
        headers: {
          Accept: 'application/dicom',
        },
        auth: {
          username: 'orthanc',
          password: 'orthanc',
        },
      });

      // Create a Blob from the response data
      const blob = new Blob([response.data], { type: 'application/dicom' });

      // Create a temporary URL for the Blob
      const url = window.URL.createObjectURL(blob);

      // Create a temporary anchor element
      const link = document.createElement('a');
      link.href = url;
      link.download = outputFilePath.split('/').pop() || 'download.dcm'; // Use the filename from outputFilePath or a default

      // Append to the document, trigger click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Release the URL object
      window.URL.revokeObjectURL(url);

      console.log('DICOM file download initiated');
    } catch (error) {
      console.error('Error downloading DICOM file from Orthanc:', error);
    }
  }

  // Function to add a report string to a DICOM file
  async function addReportToDicom(dicomFilePath: string, outputFilePath: string, report: string) {
    // Read the DICOM file as a buffer
    const dicomFileBuffer = fs.readFileSync(dicomFilePath);

    // Parse the DICOM file using dcmjs
    const dicomData = dcmjs.data.DicomMessage.readFile(dicomFileBuffer);
    const dataset = dicomData.dict;

    // Define a private tag (e.g., (0x0011, 0x1000))
    const privateTag = 'x00111000'; // Hex representation of (0x0011, 0x1000)

    // Add the report string to the private tag
    dataset[privateTag] = {
      vr: 'LT', // Long Text (LT) for the report
      Value: [report],
    };

    // Write the modified DICOM data back to a file
    const modifiedDicomBuffer = dcmjs.data.DicomMessage.writeFile(dicomData);
    fs.writeFileSync(outputFilePath, Buffer.from(modifiedDicomBuffer));

    console.log('DICOM file updated with report.');
  }

  async function extractReportFromMetadata(instanceId: string) {
    const metadata = await getDicomMetadata(instanceId);
    if (metadata) {
      // Assuming the report was stored in private tag (0x0011, 0x1000)
      const privateTag = '00111000'; // Hex representation without 'x' prefix

      // Check if the private tag exists in the metadata
      if (metadata[privateTag]) {
        const report = metadata[privateTag].Value[0]; // Extract the report string
        console.log('Report extracted from DICOM:', report);
      } else {
        console.log('Report not found in the DICOM metadata.');
      }
    }
  }

  async function uploadDicomToOrthanc(dicomFilePath: string) {
    const dicomFile = fs.createReadStream(dicomFilePath);
    const form = new FormData();
    form.append('file', dicomFile);

    try {
      const response = await axios.post('http://orthanc.zairiz.com:8042/instances', form, {
        headers: form.getHeaders(),
        auth: {
          username: 'orthanc',
          password: 'orthanc',
        },
      });

      // The response will contain the instance ID and other details
      const instanceId = response.data.ID;
      console.log('DICOM file uploaded successfully. Instance ID:', instanceId);

      // Forward the user to the updated DICOM file
      return instanceId; // You can return this instance ID for further use
    } catch (error) {
      console.error('Error uploading DICOM file to Orthanc:', error);
    }
  }

  async function replaceDicomInstance(instanceId: string, dicomFilePath: string) {
    // First, delete the existing instance
    try {
      await axios.delete(`http://orthanc.zairiz.com:8042/instances/${instanceId}`, {
        auth: {
          username: 'orthanc',
          password: 'orthanc',
        },
      });

      console.log(`DICOM instance ${instanceId} deleted successfully.`);
    } catch (error) {
      console.error(`Error deleting DICOM instance ${instanceId}`, error);
      return null;
    }

    // Upload the new DICOM file (encapsulated PDF)
    const new_instance_id = await uploadDicomToOrthanc(dicomFilePath);
    return new_instance_id;
  }

  const getCurrentInstance = () => {
    // Access the active display set from the DisplaySetService
    const displaySetService = DisplaySetService;
    const activeDisplaySet = displaySetService.getActiveDisplaySet();

    if (activeDisplaySet) {
      // Get the currently selected instance from the active display set
      const currentInstance = activeDisplaySet.getActiveInstance();

      if (currentInstance) {
        console.log('Currently opened instance:', currentInstance);
        return currentInstance;
      } else {
        console.log('No instance is currently opened in the active display set.');
        return null;
      }
    } else {
      console.log('No active display set found.');
      return null;
    }
  };

  const getSOPInstanceUID = () => {
    // Access a loaded study's metadata
    try {
      const instance = DicomMetadataStore.getInstanceByImageId(iid);
      console.log(instance);
      console.log(instance.SOPInstanceUID);
      const result: string = instance.SOPInstanceUID;
      return result;
    } catch {
      console.log(`No instance found`);
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

  // // ~~ Initial Thumbnails
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
      const blob = result.detection_image; // Adjust MIME type if necessary
      setdetectionLabel(result.detection_label);

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
                {
                  type: 'text',
                  text: 'Do an report with Example Structure with Chain of Thought.if unable to diagnose,give a relatable reporting template.Use the followings information to fill the report.',
                },
                { type: 'text', text: 'Patient Name' + patientInfo.PatientName },
                { type: 'text', text: 'Patient Date of Birth' + patientInfo.PatientDOB },
                { type: 'text', text: 'Patient Sex' + patientInfo.PatientSex },
                { type: 'text', text: 'Short Diagnosis' + detectionLabel },

                {
                  type: 'image_url',
                  image_url: { url: 'data:image/jpeg;base64,' + base64Image },
                },
                {
                  type: 'image_url',
                  image_url: { url: 'data:image/jpeg;base64,' + blobUrl },
                },
                // {
                //   type: 'image_Detection',
                //   image_url: { url: 'data:image/jpeg;base64,' + blobUrl },
                // },
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

      const output = json.choices[0].message.content.replace(/\*/g, '').trim();
      setReportOutput(output);
      console.log(output);
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

  function getInstanceIdFromUrl(): string | null {
    // Extract the URL path
    const url = window.location.pathname;

    // Split the URL into parts
    const urlSegments = url.split('/');

    // Assuming the SOPInstanceUID is the last part of the URL
    const sopInstanceUid = urlSegments[urlSegments.length - 1];

    return sopInstanceUid;
  }

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.text(reportOutput || 'No report available', 10, 10); // Add reportOutput to the PDF
    doc.save('patient_report.pdf'); // Save the PDF with a filename
  };

  const handleSaveReport = async () => {
    // console.log(StudyInstanceUIDs);
    // const input1: string = StudyInstanceUIDs[0];
    // const sopInstanceUID = await getSOPInstanceUID();
    // console.log('sopInstanceUID', sopInstanceUID);
    // const input2: string = await getInstanceIdBySOPInstanceUID(
    //   'http://orthanc.zairiz.com:8042/',
    //   sopInstanceUID
    // );
    // console.log('input1: ', input1);
    // console.log('input2: ', input2);
    // const download_path = './temp/' + input1 + '.dcm';
    // const result_path = './temp/' + input1 + 'm.dcm';
    // await downloadDicomFromOrthanc(input2, download_path);
    // await addReportToDicom(input1, result_path, reportOutput);
    // const new_instance_id = await replaceDicomInstance(input1, result_path);
    // if (new_instance_id != null) {
    //   navigate('http://localhost:3000/StudyInstanceUIDs=' + new_instance_id);
    // }
    console.log('Saved Report');
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
