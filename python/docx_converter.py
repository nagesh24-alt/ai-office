import sys
import json
import os
import mammoth

# Style map improves formatting fidelity beyond mammoth's defaults:
# preserves heading levels, strikethrough, highlighted/underlined text,
# and distinguishes block quotes so the preview looks closer to Word.
DOCX_STYLE_MAP = """
p[style-name='Title'] => h1.docx-title:fresh
p[style-name='Subtitle'] => p.docx-subtitle:fresh
p[style-name='Heading 1'] => h1:fresh
p[style-name='Heading 2'] => h2:fresh
p[style-name='Heading 3'] => h3:fresh
p[style-name='Heading 4'] => h4:fresh
p[style-name='Quote'] => blockquote:fresh
p[style-name='Intense Quote'] => blockquote.docx-intense-quote:fresh
r[style-name='Strong'] => strong
r[style-name='Emphasis'] => em
b => strong
i => em
u => u
strike => s
highlight => mark
"""


def convert_document_to_html(docx_path):
    if not os.path.isfile(docx_path):
        raise FileNotFoundError(f"DOCX file not found: {docx_path}")

    with open(docx_path, "rb") as docx_file:
        result = mammoth.convert_to_html(
            docx_file,
            convert_image=mammoth.images.data_uri,
            style_map=DOCX_STYLE_MAP,
        )

    # Wrap in a scoped container so viewer.css can target formatting
    # (tables, lists, headings) without leaking styles into the rest
    # of the host page.
    html = f'<div class="docx-preview-body">{result.value}</div>'
    messages = [str(message) for message in result.messages]
    return {
        "success": True,
        "html": html,
        "messages": messages,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "DOCX file path is required."
        }))
        sys.exit(1)

    file_path = sys.argv[1]

    try:
        result = convert_document_to_html(file_path)
        print(json.dumps(result))

    except Exception as error:
        print(json.dumps({
            "success": False,
            "error": str(error)
        }))
        sys.exit(1)