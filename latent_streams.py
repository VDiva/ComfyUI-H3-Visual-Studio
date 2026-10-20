"""H3 AV stream helpers shared with the adapted Director condition resize code."""
def _streams_from_latent(latent):
    samples=latent.get('samples') if isinstance(latent,dict) else latent
    if getattr(samples,'is_nested',False): return tuple(samples.unbind())
    if isinstance(samples,(tuple,list)): return tuple(samples)
    return (samples,)

def _repack_av_streams(streams,template=None):
    from comfy.nested_tensor import NestedTensor
    return NestedTensor(tuple(streams)) if len(streams)>1 else streams[0]
