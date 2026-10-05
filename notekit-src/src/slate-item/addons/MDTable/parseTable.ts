import { micromark } from 'micromark'
import { gfmTable, gfmTableHtml } from 'micromark-extension-gfm-table'
import { highlightSyntax, highlightHTML } from '../Markdown/mark-highlight-extensions'
// import xss from 'xss' 
// 引入katexParse
import { katexParse } from '../Latex/LatexComp'

/**
 * 把 Markdown 转成 HTML 后，仅提取 <table>…</table> 片段。
 * 返回：Array<string>（每个元素就是一个完整的 table HTML）
 */
export async function parseMarkdown(md: string) {
  // 预先替换掉行内的反斜杠转义的括号防止干扰 LaTeX 解析
  md = md.replace(/\\([\[\]\(\)])/g, '\\\\$1')

  // 启用 GFM 表格扩展和数学公式扩展
  let fullHtml = micromark(md, {
    extensions: [gfmTable(), highlightSyntax],
    htmlExtensions: [gfmTableHtml(), highlightHTML],
    allowDangerousHtml: true,
  })

  fullHtml = fullHtml.replace(/<a(\s[^>]*)?>/g, (match, attrs) => {
    // 如果已经有 target 属性，则不修改
    if (attrs && attrs.includes('target=')) {
      return match;
    }
    // 添加 target="_blank" 属性
    return attrs ? `<a${attrs} target="_blank">` : `<a target="_blank">`;
  });

  // 处理 LaTeX 公式
  const mathRegex = [
    /\$\$(.+?)\$\$/g, // 行间公式 $$...$$
    /\\\[(.+?)\\\]/g, // 行间公式 \[...\]
    /\\\((.+?)\\\)/g, // 行内公式 \(...\)
    /\$(.+?)\$/g,    // 行内公式 $...$
  ]
  for (const regex of mathRegex) {
    const latexMatches = fullHtml.match(regex);
    if (latexMatches) {
      for (const match of latexMatches) {
        const grouped = regex.exec(match)!;
        const latexContent = grouped[1];
        const renderedLatex = await katexParse({ value: latexContent.replaceAll("&lt;", "<").replaceAll("&gt;", ">"), displayMode: false, throwOnError: false });
        fullHtml = fullHtml.replace(match, renderedLatex);
        regex.lastIndex = 0; // 重置正则表达式的索引
      }
    }
  }

  return fullHtml
}

export async function parseTable(md: string) {
  const fullHtml = await parseMarkdown(md);
  // 提取所有 <table>…</table> 段落（非贪婪匹配）
  const tables = fullHtml.match(/<table[\s\S]*?<\/table>/g) || []
  return tables
}