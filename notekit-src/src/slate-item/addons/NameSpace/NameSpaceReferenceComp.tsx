import { withReference } from '../Backlink/LinkedReferenceComp';

export const NameSpaceReferenceComp = withReference({
  type: 'namespace',
  i18nTitle: 'nameSpace.namespace_references',
  getList: (item, $) => $.nameSpace.getBacklinkItems(item),
  count: (item, $) =>
    item.topic ? $.nameSpace.findMeanings(item.topic, true).length : 0,
  foldupTopics: true,
});
