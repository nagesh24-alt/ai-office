import json
import sys
from docx import Document


def process_docx(file_path):
	document = Document(file_path)

	paragraphs = []

	for paragraph in document.paragraphs:
		text = paragraph.text.strip()

		if text:
			paragraphs.append(text)

	return {
		"success": True,
		"filename": file_path,
		"paragraph_count": len(paragraphs),
		"paragraphs": paragraphs
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
        result = process_docx(file_path)
        print(json.dumps(result))

    except Exception as error:
        print(json.dumps({
            "success": False,
            "error": str(error)
        }))
        sys.exit(1)