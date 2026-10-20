"""Create an in-memory template archive; never writes client-supplied paths to disk."""
import io,zipfile
from pathlib import PurePosixPath

def template_zip(payload):
    entries=payload.get("entries") if isinstance(payload,dict) else None
    if not isinstance(entries,list) or not 1<=len(entries)<=2500: raise ValueError("模板文件数量无效")
    stream=io.BytesIO();seen=set();total=0
    with zipfile.ZipFile(stream,"w",zipfile.ZIP_DEFLATED) as archive:
        for row in entries:
            path=row.get("path","");text=row.get("text","")
            if not isinstance(path,str) or not path or len(path)>250 or "\\" in path or ":" in path or "\x00" in path or PurePosixPath(path).is_absolute() or any(p in {".",".."} for p in path.split("/")) or path in seen: raise ValueError("模板路径无效或重复")
            seen.add(path)
            if row.get("directory"):
                if not path.endswith("/"): raise ValueError("目录路径无效")
                archive.writestr(path,b"")
            else:
                if not isinstance(text,str): raise ValueError("模板内容格式错误")
                data=text.encode("utf-8");total+=len(data)
                if total>8*1024*1024: raise ValueError("模板内容过大")
                archive.writestr(path,data)
    return stream.getvalue()
