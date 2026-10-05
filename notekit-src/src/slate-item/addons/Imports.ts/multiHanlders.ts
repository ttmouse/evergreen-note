import { $t } from '../../../i18n';
import { isEmpty } from '../../utils/isEmpty';
import { showSnack } from '../../utils/msg/showSnack';
import { ImportFormat, ImportHanlder } from './Imports';

export const multiHanlders: { [type in ImportFormat]?: ImportHanlder } = {
  fulljson({ source, app }) {
    if (
      !(
        (source.startsWith('[') && source.endsWith(']')) ||
        (source.startsWith('{') && source.endsWith('}'))
      )
    ) {
      showSnack({
        content: $t`imports.json_error`,
        severity: 'error',
      });
      return false;
    }

    const allItems = JSON.parse(source) as any;
    if (isEmpty(allItems)) {
      showSnack({
        content: $t`imports.empty_warning`,
        severity: 'warning',
      });
      return false;
    }

    if (allItems.dbid) {
      return allItems.list;
    }

    return allItems;
  },
};
