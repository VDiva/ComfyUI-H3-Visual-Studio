from merge_video import stream_signature
one="Stream #0:0: Video: h264 (High), yuv420p, 864x480, 1234 kb/s, 24 fps, 24 tbr, 12288 tbn"
two="Stream #0:0: Video: h264 (High), yuv420p, 864x480, 875.5 kb/s, 23.99 fps, 24.01 tbr, 12288 tbn"
assert stream_signature(one)==stream_signature(two)
assert stream_signature(one)!=stream_signature(two.replace("864x480","1280x720"))
assert stream_signature(one)!=stream_signature(two.replace("h264","hevc"))
print("PASS merge signatures ignore bitrate/timing estimates and reject codec/dimension differences")
