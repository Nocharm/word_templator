"""Word SEQ / REF 필드 OOXML emit 헬퍼.

python-docx 가 SEQ/REF 를 직접 지원하지 않으므로 raw bytes 를 만들어
caller (`render_docx`) 가 paragraph element 에 삽입한다.

북마크 ID 규약: `_Ref_{label_kind}_{block_id}`
Block.id 는 UUID prefix 기반으로 충돌 가능성 무시 가능.
"""

from typing import Literal

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
LabelKind = Literal["figure", "table"]


def bookmark_id_for(label_kind: LabelKind, block_id: str) -> str:
    return f"_Ref_{label_kind}_{block_id}"


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_caption_paragraph_xml(
    *,
    label: str,
    seq_kind: str,
    block_id: str,
    cached_number: int,
    tail_text: str,
    bookmark_id: int = 0,
) -> bytes:
    """캡션 paragraph 의 OOXML.

    구조: `<w:p> [라벨 run] <bookmarkStart> [SEQ field runs] <bookmarkEnd> [tail run] </w:p>`
    OOXML 스펙상 fldChar 는 반드시 <w:r> 안에 있어야 한다.
    """
    label_kind: LabelKind = (
        "figure" if seq_kind.lower().startswith("fig") else "table"
    )
    bm_name = bookmark_id_for(label_kind, block_id)
    instr = f" SEQ {seq_kind} \\* ARABIC "
    return (
        f'<w:p xmlns:w="{W_NS}">'
        f'<w:r><w:t xml:space="preserve">{_escape(label)} </w:t></w:r>'
        f'<w:bookmarkStart w:id="{bookmark_id}" w:name="{bm_name}"/>'
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
        f'<w:r><w:instrText xml:space="preserve">{instr}</w:instrText></w:r>'
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
        f"<w:r><w:t>{cached_number}</w:t></w:r>"
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
        f'<w:bookmarkEnd w:id="{bookmark_id}"/>'
        f'<w:r><w:t xml:space="preserve">{_escape(tail_text)}</w:t></w:r>'
        "</w:p>"
    ).encode()


def build_ref_run_xml(
    *,
    label_kind: LabelKind,
    block_id: str,
    cached_number: int,
    prefix_text: str,
) -> bytes:
    """본문 단락에 inline 으로 삽입할 run 시퀀스: `[prefix] REF field`.

    호출자가 paragraph 의 적절한 위치(매칭 span)에 삽입한다.
    """
    bm_name = bookmark_id_for(label_kind, block_id)
    instr = f" REF {bm_name} \\h "
    w = f'xmlns:w="{W_NS}"'
    return (
        f'<w:r {w}><w:t xml:space="preserve">{_escape(prefix_text)}</w:t></w:r>'
        f'<w:r {w}><w:fldChar w:fldCharType="begin"/></w:r>'
        f'<w:r {w}><w:instrText xml:space="preserve">{instr}</w:instrText></w:r>'
        f'<w:r {w}><w:fldChar w:fldCharType="separate"/></w:r>'
        f'<w:r {w}><w:t>{cached_number}</w:t></w:r>'
        f'<w:r {w}><w:fldChar w:fldCharType="end"/></w:r>'
    ).encode()
