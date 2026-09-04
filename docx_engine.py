#!/usr/bin/env python3
"""
NeuroCore Office - Python DOCX Engine
Handles DOCX reading, writing, XML extraction, Python-based document transformations,
and WordprocessingML formatting.
"""

import sys
import os
import json
import zipfile
import re
import html
import xml.etree.ElementTree as ET
from datetime import datetime

# XML Namespaces
NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'cp': 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
    'dc': 'http://purl.org/dc/elements/1.1/',
    'dcterms': 'http://purl.org/dc/terms/'
}

def get_document_stats(docx_path):
    """Extract statistics from a docx file."""
    if not os.path.exists(docx_path):
        return {"error": "File not found", "words": 0, "characters": 0, "paragraphs": 0}

    try:
        with zipfile.ZipFile(docx_path, 'r') as docx:
            if 'word/document.xml' not in docx.namelist():
                return {"error": "Invalid docx", "words": 0, "characters": 0, "paragraphs": 0}
            
            xml_content = docx.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            
            paragraphs = tree.findall('.//w:p', NS)
            tables = tree.findall('.//w:tbl', NS)
            
            text_chunks = []
            for p in paragraphs:
                texts = p.findall('.//w:t', NS)
                p_text = ''.join([t.text or '' for t in texts if t.text])
                if p_text:
                    text_chunks.append(p_text)
                    
            full_text = ' '.join(text_chunks)
            words = len(re.findall(r'\b\w+\b', full_text))
            characters = len(full_text)
            
            return {
                "success": True,
                "words": words,
                "characters": characters,
                "paragraphs": len(paragraphs),
                "tables": len(tables),
                "sections": max(1, len(tree.findall('.//w:sectPr', NS))),
                "preview_text": full_text[:400] + ('...' if len(full_text) > 400 else '')
            }
    except Exception as e:
        return {"error": str(e), "words": 0, "characters": 0, "paragraphs": 0}

def parse_docx_to_html(docx_path):
    """Convert docx XML into structured semantic HTML with styles."""
    if not os.path.exists(docx_path):
        return "<p>File not found</p>"

    try:
        with zipfile.ZipFile(docx_path, 'r') as docx:
            if 'word/document.xml' not in docx.namelist():
                return "<p>Empty or invalid DOCX document.</p>"
            
            xml_content = docx.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            body = tree.find('.//w:body', NS)
            if body is None:
                return "<p>Empty document.</p>"
                
            html_parts = []
            for child in body:
                tag = child.tag.split('}')[-1]
                if tag == 'p':
                    # Check paragraph style
                    pStyle = child.find('.//w:pPr/w:pStyle', NS)
                    style_val = pStyle.attrib.get(f'{{{NS["w"]}}}val', '') if pStyle is not None else ''
                    
                    # Check alignment
                    jc = child.find('.//w:pPr/w:jc', NS)
                    align_style = ""
                    if jc is not None:
                        align_val = jc.attrib.get(f'{{{NS["w"]}}}val', '')
                        if align_val in ['center', 'right', 'both']:
                            align_css = 'justify' if align_val == 'both' else align_val
                            align_style = f' style="text-align: {align_css};"'

                    # Gather text runs
                    runs_html = []
                    for run in child.findall('.//w:r', NS):
                        rPr = run.find('w:rPr', NS)
                        is_bold = rPr is not None and rPr.find('w:b', NS) is not None
                        is_italic = rPr is not None and rPr.find('w:i', NS) is not None
                        is_underline = rPr is not None and rPr.find('w:u', NS) is not None
                        color_elem = rPr.find('w:color', NS) if rPr is not None else None
                        color_val = color_elem.attrib.get(f'{{{NS["w"]}}}val', '') if color_elem is not None else ''

                        texts = run.findall('w:t', NS)
                        run_text = ''.join([html.escape(t.text) for t in texts if t.text])
                        
                        if not run_text:
                            continue
                            
                        chunk = run_text
                        if color_val:
                            chunk = f'<span style="color: #{color_val};">{chunk}</span>'
                        if is_underline:
                            chunk = f'<u>{chunk}</u>'
                        if is_italic:
                            chunk = f'<em>{chunk}</em>'
                        if is_bold:
                            chunk = f'<strong>{chunk}</strong>'
                        runs_html.append(chunk)

                    p_content = ''.join(runs_html)
                    if not p_content:
                        p_content = '&nbsp;'

                    if 'Heading1' in style_val or style_val == '1':
                        html_parts.append(f'<h1{align_style}>{p_content}</h1>')
                    elif 'Heading2' in style_val or style_val == '2':
                        html_parts.append(f'<h2{align_style}>{p_content}</h2>')
                    elif 'Heading3' in style_val or style_val == '3':
                        html_parts.append(f'<h3{align_style}>{p_content}</h3>')
                    elif 'Title' in style_val:
                        html_parts.append(f'<h1 class="docx-doc-title"{align_style}>{p_content}</h1>')
                    elif 'Subtitle' in style_val:
                        html_parts.append(f'<p class="docx-doc-subtitle"{align_style}>{p_content}</p>')
                    else:
                        html_parts.append(f'<p{align_style}>{p_content}</p>')
                        
                elif tag == 'tbl':
                    # Parse Table
                    table_html = ['<table class="docx-rendered-table" style="border-collapse: collapse; width: 100%; margin: 12px 0;">']
                    for row in child.findall('.//w:tr', NS):
                        table_html.append('<tr>')
                        for cell in row.findall('.//w:tc', NS):
                            cell_texts = []
                            for cp in cell.findall('.//w:p', NS):
                                texts = cp.findall('.//w:t', NS)
                                p_txt = ''.join([html.escape(t.text) for t in texts if t.text])
                                if p_txt:
                                    cell_texts.append(p_txt)
                            c_content = '<br>'.join(cell_texts) if cell_texts else '&nbsp;'
                            table_html.append(f'<td style="border: 1px solid #cbd5e1; padding: 8px 12px;">{c_content}</td>')
                        table_html.append('</tr>')
                    table_html.append('</table>')
                    html_parts.append(''.join(table_html))

            return '\n'.join(html_parts) if html_parts else "<p>Empty document.</p>"
    except Exception as e:
        return f"<p>Error parsing DOCX: {html.escape(str(e))}</p>"

def create_docx_package(html_or_text, output_path, title="New Document", author="NeuroCore Office"):
    """
    Generate a compliant OpenXML DOCX archive directly using Python standard library.
    """
    paragraphs = []
    
    # Normalize HTML tags into proper paragraph breaks before splitting
    normalized = re.sub(r'</?(?:p|div|h[1-6]|li|tr|table|blockquote)[^>]*>', '\n', html_or_text, flags=re.IGNORECASE)
    normalized = re.sub(r'<br\s*/?>', '\n', normalized, flags=re.IGNORECASE)
    lines = normalized.split('\n')
    for line in lines:
        cleaned = re.sub(r'<[^>]*>', '', line).strip()
        cleaned = html.unescape(cleaned).strip()
        if cleaned:
            paragraphs.append(cleaned)
    if not paragraphs:
        paragraphs = [title, "Document created with NeuroCore Office Python Engine."]

    # Build document.xml
    p_xml_elements = []
    
    # Title element
    p_xml_elements.append(f"""
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Title"/>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
          <w:b/>
          <w:sz w:val="48"/>
          <w:color w:val="18181B"/>
        </w:rPr>
        <w:t>{html.escape(title)}</w:t>
      </w:r>
    </w:p>
    """)

    for p in paragraphs:
        if p == title:
            continue
        is_heading = p.startswith('# ') or p.startswith('1.') or p.startswith('2.') or p.startswith('3.')
        if is_heading:
            clean_head = p.lstrip('#').strip()
            p_xml_elements.append(f"""
            <w:p>
              <w:pPr>
                <w:pStyle w:val="Heading1"/>
                <w:spacing w:before="240" w:after="120"/>
              </w:pPr>
              <w:r>
                <w:rPr>
                  <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
                  <w:b/>
                  <w:sz w:val="32"/>
                  <w:color w:val="27272A"/>
                </w:rPr>
                <w:t>{html.escape(clean_head)}</w:t>
              </w:r>
            </w:p>
            """)
        else:
            p_xml_elements.append(f"""
            <w:p>
              <w:pPr>
                <w:spacing w:before="60" w:after="120" w:line="276" w:lineRule="auto"/>
              </w:pPr>
              <w:r>
                <w:rPr>
                  <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
                  <w:sz w:val="24"/>
                </w:rPr>
                <w:t xml:space="preserve">{html.escape(p)}</w:t>
              </w:r>
            </w:p>
            """)

    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    {''.join(p_xml_elements)}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"""

    content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""

    rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""

    now = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    core_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{html.escape(title)}</dc:title>
  <dc:creator>{html.escape(author)}</dc:creator>
  <cp:lastModifiedBy>{html.escape(author)}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>
</cp:coreProperties>"""

    app_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>NeuroCore Office Word Engine</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company>NeuroCore Office</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>"""

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', content_types_xml)
        zf.writestr('_rels/.rels', rels_xml)
        zf.writestr('word/document.xml', document_xml)
        zf.writestr('docProps/core.xml', core_xml)
        zf.writestr('docProps/app.xml', app_xml)

    return True

def python_transform_docx(docx_path, transform_type, param_dict=None):
    """
    Execute Python transformations on a docx file (Find/Replace, Uppercase headings, Table insertion, etc.)
    """
    if not os.path.exists(docx_path):
        return {"error": "File not found"}
    if param_dict is None:
        param_dict = {}

    try:
        # Read existing zip
        temp_dir = docx_path + ".pytemp"
        os.makedirs(temp_dir, exist_ok=True)
        
        with zipfile.ZipFile(docx_path, 'r') as docx:
            docx.extractall(temp_dir)
            
        doc_xml_path = os.path.join(temp_dir, 'word', 'document.xml')
        if not os.path.exists(doc_xml_path):
            return {"error": "Invalid docx structure"}

        with open(doc_xml_path, 'r', encoding='utf-8') as f:
            xml_text = f.read()

        if transform_type == 'find_replace':
            find_str = param_dict.get('find', '')
            replace_str = param_dict.get('replace', '')
            if find_str:
                xml_text = xml_text.replace(html.escape(find_str), html.escape(replace_str))
                xml_text = xml_text.replace(find_str, replace_str)

        elif transform_type == 'format_clean':
            # Remove double spaces
            xml_text = re.sub(r'  +', ' ', xml_text)

        elif transform_type == 'add_header_notice':
            notice = param_dict.get('notice', 'CONFIDENTIAL - NEUROCORE OFFICE')
            notice_xml = f"""<w:p><w:pPr><w:jc w:val="center"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="3B82F6"/></w:pBdr></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="2563EB"/></w:rPr><w:t>{html.escape(notice)}</w:t></w:r></w:p>"""
            xml_text = xml_text.replace('<w:body>', f'<w:body>{notice_xml}')

        with open(doc_xml_path, 'w', encoding='utf-8') as f:
            f.write(xml_text)

        # Repackage
        with zipfile.ZipFile(docx_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(temp_dir):
                for file in files:
                    full_p = os.path.join(root, file)
                    rel_p = os.path.relpath(full_p, temp_dir)
                    zf.write(full_p, rel_p)

        # Cleanup temp
        for root, dirs, files in os.walk(temp_dir, topdown=False):
            for file in files:
                os.remove(os.path.join(root, file))
            for d in dirs:
                os.rmdir(os.path.join(root, d))
        os.rmdir(temp_dir)

        return {"success": True, "message": f"Transformation '{transform_type}' applied successfully by Python"}

    except Exception as e:
        return {"error": str(e)}

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command provided"}))
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "stats":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Path required"}))
            return
        res = get_document_stats(sys.argv[2])
        print(json.dumps(res))

    elif cmd == "to_html":
        if len(sys.argv) < 3:
            print("<p>No file specified</p>")
            return
        print(parse_docx_to_html(sys.argv[2]))

    elif cmd == "create":
        # python docx_engine.py create <output_path> <title> <content>
        out_path = sys.argv[2] if len(sys.argv) > 2 else "output.docx"
        title = sys.argv[3] if len(sys.argv) > 3 else "New Document"
        content = sys.argv[4] if len(sys.argv) > 4 else "Document content"
        success = create_docx_package(content, out_path, title=title)
        print(json.dumps({"success": success, "path": out_path}))

    elif cmd == "transform":
        # python docx_engine.py transform <docx_path> <type> <json_params>
        docx_path = sys.argv[2]
        transform_type = sys.argv[3]
        params = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}
        res = python_transform_docx(docx_path, transform_type, params)
        print(json.dumps(res))

    elif cmd == "exec":
        # Run custom Python snippet with stdout capture
        import io
        import contextlib
        script_code = sys.argv[2]
        exec_globals = {}
        stdout_buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(stdout_buf):
                exec(script_code, exec_globals)
            out_str = stdout_buf.getvalue()
            res_val = exec_globals.get('result', None)
            print(json.dumps({"success": True, "output": out_str.strip(), "result": str(res_val) if res_val is not None else ""}))
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    main()
