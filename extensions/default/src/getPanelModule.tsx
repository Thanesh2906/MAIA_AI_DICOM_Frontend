import React from 'react';
import { WrappedPanelStudyBrowser, PanelMeasurementTable } from './Panels';
import AiDiagnosisPanel from '../../../maia-extensions/ai/src/index';
import i18n from 'i18next';

// TODO:
// - No loading UI exists yet
// - cancel promises when component is destroyed
// - show errors in UI for thumbnails if promise fails

function getPanelModule({ commandsManager, extensionManager, servicesManager }) {
  const wrappedMeasurementPanel = ({ renderHeader, getCloseIcon, tab }) => {
    return (
      <PanelMeasurementTable
        commandsManager={commandsManager}
        servicesManager={servicesManager}
        extensionManager={extensionManager}
        renderHeader={renderHeader}
        getCloseIcon={getCloseIcon}
        tab={tab}
      />
    );
  };

  return [
    {
      name: 'seriesList',
      iconName: 'tab-studies',
      iconLabel: 'Studies',
      label: i18n.t('SidePanel:Studies'),
      component: props => (
        <WrappedPanelStudyBrowser
          {...props}
          commandsManager={commandsManager}
          extensionManager={extensionManager}
          servicesManager={servicesManager}
        />
      ),
    },
    {
      name: 'measurements',
      iconName: 'tab-linear',
      iconLabel: 'Measure',
      label: i18n.t('SidePanel:Measurements'),
      secondaryLabel: i18n.t('SidePanel:Measurements'),
      component: wrappedMeasurementPanel,
    },
    {
      name: 'aiDiagnosis',
      iconName: 'tab-ai',
      iconLabel: 'AI Diagnosis',
      label: i18n.t('SidePanel:AI Diagnosis'),
      component: props => (
        <AiDiagnosisPanel
          {...props}
          commandsManager={commandsManager}
          extensionManager={extensionManager}
          servicesManager={servicesManager}
        />
      ),
    },
  ];
}

export default getPanelModule;
