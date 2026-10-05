import { LoadedAddons } from '../../../main';
import { todayFmt } from '../../utils/date/datekit';

export const STEPS = {
  nav: {
    title: '左侧导航栏',
    content: '这是最重要的功能入口，你可以创建一篇笔记，或者查看已有的笔记',
    selector: '#RoamEdit-nav',
    p: 'e',
  },
  databaseID: {
    title: '数据库ID',
    content:
      '这是你当前所打开的数据库的ID，你的笔记都将被保存到数据库里，你可以创建多个数据库，并且随时切换你想打开的数据库',
    selector: '#RoamEdit-nav > .node-head',
    p: 'e',
  },
  dailyNote: {
    title: '每日笔记',
    selector: '#RoamEdit-dailynote',
    content:
      '这是一个快速记录笔记的一个入口，你可以将每天你所学的知识、你的感悟、见闻都记录在这里',
    p: 'e',
  },
  topicList: {
    title: '主题列表',
    content: '这是你所有笔记的列表，你可以在这里查看所有你创建过的笔记主题',
    selector: '#RoamEdit-topiclist',
    to: '/topics',
    p: 'e',
  },
  topicList2: {
    title: '主题列表',
    content:
      '你可以的主题列表查看所有你创建过的笔记主题，根据字数、创建时间、更新时间对笔记进行排序',
    selector: '.MuiTableHead-root',
    p: 's',
  },
  graphs: {
    title: '图谱',
    content:
      'RoamEdit 会根据你笔记中存在的链接关系，为你可视化地展示你的知识网络，感受知识之间的联系',
    selector: '#RoamEdit-graphs',
    p: 'e',
  },
  star: {
    title: '星标',
    selector: '#RoamEdit-stars',
    to: '/AppStars',
    content:
      '你可以将你认为重要的笔记标记为星标，这样你就可以在这里快速查看你的重要笔记',
    p: 'e',
  },
  step2: {
    title: '星标主题',
    selector: '.main-area .editor-view .node-top',
    content:
      '你收藏的星标笔记，都保存在“星标”这个笔记主题里，你可以像编辑普通笔记一样编辑它',
    p: 's',
  },
  recent: {
    selector: '#RoamEdit-recent',
    title: '最近打开的笔记',
    content: '这里会显示你最近打开过的笔记，你可以在这里快速打开它们',
    p: 'e',
  },
  mainArea: {
    title: '主编辑区',
    content: '这里是你编辑笔记的地方',
    to: '/diaries',
    selector: '.main-area .editor-view',
    p: 'w',
  },
  mainArea2: {
    title: '主编辑区',
    content: '文档的操作菜单',
    to: '/diaries',
    selector: '.main-area .editor-view .node-top .node-extra',
    p: 's',
  },
  extArea: {
    title: '右侧扩展区',
    content:
      '在右侧扩展区，你可以打开多个笔记文档，方便你在主编辑区做笔记时查阅已有的笔记',
    selector: '.extarea',
    p: 'w',
    action($: LoadedAddons) {
      $.extArea.add({
        type: 'topic',
        key: todayFmt(),
      });
    },
  },
  helpIcon: {
    title: '帮助信息',
    content: '点击这里可以查看更多使用帮助信息',
    selector: '.help-icon',
    action($: LoadedAddons) {
      $.extArea.clear();
    },
    p: 'w',
  },
  preferences: {
    title: '偏好设置',
    content: '根据自己的喜好进行个性化的设置',
    selector: '.preferences-dialog .MuiPaper-root',
    p: 'w',
    action($: LoadedAddons) {
      $.prefer.showCfgForm();
    },
  },

  addonCenter: {
    title: '插件中心',
    content: '在这里你可以安装、卸载、更新插件',
    selector: '.addon-list',
    p: 'w',
    action($: LoadedAddons) {
      $.addonCenter.show();
    },
  },

  addonCenter2: {
    title: '插件详情',
    content: '还可以查看插件的详细信息，功能介绍，使用技巧等',
    selector: '.AddonIframe',
    p: 's',
  },
};
