import { Editor, Path, Text, Range, Node } from '../../slate.inc';
import { ItemEditor } from '../../addons/EditorFactory/ItemEditor';
import { UnitProps } from '../../interfaces/unit';
import { isEmpty } from '../isEmpty';

export function getRangeTextData(editor: ItemEditor, range: Range): Text[] {
  const fragment: Text[] = [];
  for (const [node, path] of Editor.nodes(editor, {
    at: range,
    match: (n: Node) => Text.isText(n) || editor.isInline(n),
  })) {
    if (Text.isText(node) && editor.isInline(Node.parent(editor, path))) {
      continue;
    }
    if (Path.equals(range.focus.path, path)) {
      fragment.push({
        ...node,
        text: (node as Text).text.slice(0, range.focus.offset),
      });
    } else if (Path.equals(range.anchor.path, path)) {
      fragment.push({
        ...node,
        text: (node as Text).text.slice(range.anchor.offset),
      });
    } else {
      fragment.push(node as Text);
    }
  }
  return fragment;
}

export function getRangeText(editor: ItemEditor, range: Range): string {
  const fragment: Text[] = [];
  for (const [node, path] of Editor.nodes(editor, {
    at: range,
    match: (n: Node) => Text.isText(n) || editor.isInline(n),
  })) {
    if (editor.isInline(node as any)) {
      continue;
    }
    if (Path.equals(range.focus.path, path)) {
      fragment.push({
        ...node,
        text: (node as Text).text.slice(0, range.focus.offset),
      });
    } else {
      fragment.push(node as Text);
    }
  }
  return fragment.map((text) => Node.string(text)).join('');
}

export function obj2list(obj, mapFunc = (v: any) => v) {
  const list: any[] = [];
  for (const v of Object.values(obj)) {
    if (v && !isEmpty((v as UnitProps).body)) {
      (v as any).body = obj2list((v as UnitProps).body);
    } else if (v && !isEmpty((v as UnitProps).subitems)) {
      (v as any).subitems = obj2list((v as UnitProps).subitems);
    }
    list.push({ ...mapFunc(v) });
  }
  return list as UnitProps[];
}
