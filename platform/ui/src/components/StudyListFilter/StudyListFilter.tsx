import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import LegacyButton from '../LegacyButton';
import Icon from '../Icon';
import Typography from '../Typography';
import InputGroup from '../InputGroup';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
} from '../../../../../component/alert-dialog';
import { Button } from '@ohif/ui';

const StudyListFilter = ({
  filtersMeta,
  filterValues,
  onChange,
  clearFilters,
  isFiltering,
  numOfStudies,
  onUploadClick,
  getDataSourceConfigurationComponent,
}) => {
  const { t } = useTranslation('StudyList');
  const { sortBy, sortDirection } = filterValues;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const isMounted = useRef(true);
  const filterSorting = { sortBy, sortDirection };

  const setFilterSorting = sortingValues => {
    onChange({
      ...filterValues,
      ...sortingValues,
    });
  };
  const isSortingEnabled = numOfStudies > 0 && numOfStudies <= 100;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const closeDialog = () => {
    setIsDialogOpen(false); // Function to close the dialog
  };

  const fileInputRef = useRef(null);

  const handleFilesDrop = async files => {
    await handleFileUpload(Array.from(files));
  };

  const handleFileUpload = async files => {
    setIsUploading(true);

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files[]', file);
    });

    const controller = new AbortController();
    const signal = controller.signal;
    try {
      const response = await fetch('http://localhost:8042/instances', {
        method: 'POST',
        body: formData,
        mode: 'no-cors',
        referrerPolicy: 'strict-origin-when-cross-origin',
        signal,
      });

      if (!response.ok) {
        console.log('Upload successful', response);
        window.location.reload();
        throw new Error('Network response was not ok');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error("Erreur lors de l'envoi des fichiers:", error);
      }
    } finally {
      if (isMounted.current) {
        setIsUploading(false);
        window.location.reload();
      }
    }
  };

  const handleDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesDrop(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  const handleDragOver = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleChange = e => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesDrop(e.target.files);
    }
  };

  const handleClick = () => {
    fileInputRef.current.click();
  };

  return (
    <React.Fragment>
      <div>
        <div className="bg-black">
          <div className="container relative mx-auto flex flex-col pt-5">
            <div className="flex flex-row justify-end">
              <AlertDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
              >
                <AlertDialogTrigger>
                  <Button className="mr-6 rounded-md">Upload Study</Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-[850px]">
                  <AlertDialogHeader>
                    <AlertDialogDescription>
                      <div className="text-center">
                        <button
                          onClick={handleClick}
                          className={`mb-4 rounded bg-blue-500 py-2 px-4 font-bold text-white hover:bg-blue-700 ${isUploading ? 'cursor-not-allowed opacity-50' : ''}`}
                          disabled={isUploading}
                        >
                          {isUploading ? 'Progress in processing ...' : 'Select files'}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          style={{ display: 'none' }}
                          onChange={handleChange}
                          disabled={isUploading}
                        />
                        <div
                          className={`border-2 border-dashed border-gray-300 p-10 ${isUploading ? 'opacity-50' : ''}`}
                          onDrop={handleDrop}
                          onDragOver={handleDragOver}
                        >
                          Drag and drop DICOM files here.
                        </div>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <Button onClick={closeDialog}>Cancel</Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="mb-5 flex flex-row justify-between">
              <div className="flex min-w-[1px] shrink flex-row items-center gap-6">
                <Typography
                  variant="h6"
                  className="text-white"
                >
                  {t('StudyList')}
                </Typography>
                {getDataSourceConfigurationComponent && getDataSourceConfigurationComponent()}
                {onUploadClick && (
                  <div
                    className="text-primary-active flex cursor-pointer items-center gap-2 self-center text-lg font-semibold"
                    onClick={onUploadClick}
                  >
                    <Icon name="icon-upload"></Icon>
                    <span>{t('Upload')}</span>
                  </div>
                )}
              </div>
              <div className="flex h-[34px] flex-row items-center">
                {/* TODO revisit the completely rounded style of button used for clearing the study list filter - for now use LegacyButton*/}
                {isFiltering && (
                  <LegacyButton
                    rounded="full"
                    variant="outlined"
                    color="primaryActive"
                    border="primaryActive"
                    className="mx-8"
                    startIcon={<Icon name="cancel" />}
                    onClick={clearFilters}
                  >
                    {t('ClearFilters')}
                  </LegacyButton>
                )}
                <Typography
                  variant="h6"
                  className="text-primary-light"
                >
                  {`${t('Number of studies')}: `}
                </Typography>
                <Typography
                  variant="h6"
                  className="mr-2"
                  data-cy={'num-studies'}
                >
                  {numOfStudies > 100 ? '>100' : numOfStudies}
                </Typography>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="sticky -top-1 z-10 mx-auto border-b-4 border-black">
        <div className="bg-primary-dark pt-3 pb-3">
          <InputGroup
            inputMeta={filtersMeta}
            values={filterValues}
            onValuesChange={onChange}
            sorting={filterSorting}
            onSortingChange={setFilterSorting}
            isSortingEnabled={isSortingEnabled}
          />
        </div>
        {numOfStudies > 100 && (
          <div className="container m-auto">
            <div className="bg-primary-main rounded-b py-1 text-center text-base">
              <p className="text-white">
                {t('Filter list to 100 studies or less to enable sorting')}
              </p>
            </div>
          </div>
        )}
      </div>
    </React.Fragment>
  );
};

StudyListFilter.propTypes = {
  filtersMeta: PropTypes.arrayOf(
    PropTypes.shape({
      /** Identifier used to map a field to it's value in `filterValues` */
      name: PropTypes.string.isRequired,
      /** Friendly label for filter field */
      displayName: PropTypes.string.isRequired,
      /** One of the supported filter field input types */
      inputType: PropTypes.oneOf(['Text', 'MultiSelect', 'DateRange', 'None']).isRequired,
      isSortable: PropTypes.bool.isRequired,
      /** Size of filter field in a 12-grid system */
      gridCol: PropTypes.oneOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).isRequired,
      /** Options for a "MultiSelect" inputType */
      option: PropTypes.arrayOf(
        PropTypes.shape({
          value: PropTypes.string,
          label: PropTypes.string,
        })
      ),
    })
  ).isRequired,
  filterValues: PropTypes.object.isRequired,
  numOfStudies: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  clearFilters: PropTypes.func.isRequired,
  isFiltering: PropTypes.bool.isRequired,
  onUploadClick: PropTypes.func,
  getDataSourceConfigurationComponent: PropTypes.func,
};

export default StudyListFilter;
