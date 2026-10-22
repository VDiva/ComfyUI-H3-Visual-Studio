from .director_core.nodes.director import MiniMaxH3Director
from .director_core.nodes.director_refine import MiniMaxH3DirectorRefine
from .director_core.nodes.director_selflift import MiniMaxH3DirectorSelfLift
from .director_core.director.external_groups import pack_r2v_group, pack_i2v_group


def studio_schema(cls):
    schema = cls.INPUT_TYPES()
    return {section: {key: spec for key, spec in fields.items()
                      if spec[0] != 'BDGROUP'} for section, fields in schema.items()}


class H3StudioDirector(MiniMaxH3Director):
    @classmethod
    def INPUT_TYPES(cls):
        schema = studio_schema(MiniMaxH3Director)
        schema.setdefault('optional', {})['dialogue'] = ('H3_STUDIO_DIALOGUE',)
        schema['required']['task_type'] = (['r2v', 'fl2v'], {'default': 'r2v'})
        return schema


class H3StudioDirectorRefine(MiniMaxH3DirectorRefine):
    @classmethod
    def INPUT_TYPES(cls):
        schema = studio_schema(MiniMaxH3DirectorRefine)
        schema['optional'].update({key: ('INT', {'default': 0, 'min': 0, 'max': 8192, 'step': 32})
                                   for key in ('target_width', 'target_height')})
        return schema

    def pack(self, *args, **kwargs):
        result = super().pack(*args, **kwargs)
        if kwargs.get('target_width', 0) > 0 and kwargs.get('target_height', 0) > 0:
            result[0]['studio_fixed_canvas'] = True
        return result


class H3StudioDirectorSelfLift(MiniMaxH3DirectorSelfLift):
    @classmethod
    def INPUT_TYPES(cls):
        return studio_schema(MiniMaxH3DirectorSelfLift)


class H3StudioDirectorGroup:
    @classmethod
    def INPUT_TYPES(cls):
        optional = {}
        for prefix, kind, count in [('image', 'IMAGE', 9), ('audio', 'AUDIO', 3), ('video', 'IMAGE', 3)]:
            optional.update({f'{prefix}_{i}': (kind,) for i in range(count)})
        return {'required': {'prompt': ('STRING', {'multiline': True}),
                             'duration_sec': ('FLOAT', {'default': 5.0, 'min': 0.2, 'max': 120.0})},
                'optional': optional}
    RETURN_TYPES = ('MMX_DIR_GROUP',)
    FUNCTION = 'pack'
    CATEGORY = 'MiniMax H3/Visual Studio'

    def pack(self, prompt, duration_sec, **refs):
        def values(prefix):
            return {int(key.rsplit('_', 1)[1]): value for key, value in refs.items()
                    if key.startswith(prefix + '_') and value is not None}
        return (pack_r2v_group(prompt=prompt, duration_sec=duration_sec,
                              ref_images=values('image'), ref_audios=values('audio'),
                              ref_videos=values('video')),)


class H3StudioFrameGroup:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required':{'prompt':('STRING',{'multiline':True}),'duration_sec':('FLOAT',{'default':5.0,'min':0.2,'max':120.0})},'optional':{'first_frame':('IMAGE',),'last_frame':('IMAGE',)}}
    RETURN_TYPES=('MMX_DIR_GROUP',)
    FUNCTION='pack'
    CATEGORY='MiniMax H3/Visual Studio'
    def pack(self,prompt,duration_sec,first_frame=None,last_frame=None):
        return (pack_i2v_group(prompt=prompt,duration_sec=duration_sec,first_frame=first_frame,last_frame=last_frame),)


class H3StudioGroupsCombine:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required':{},'optional':{f'group_{i}':('MMX_DIR_GROUP',) for i in range(200)}}
    RETURN_TYPES=('MMX_DIR_GROUP',)
    FUNCTION='combine'
    CATEGORY='MiniMax H3/Visual Studio'
    def combine(self,**groups):
        rows=[]
        for key in sorted(groups,key=lambda k:int(k.rsplit('_',1)[1])):
            value=groups[key]
            rows.extend(value if isinstance(value,list) else [value])
        return (rows,)


NODE_CLASS_MAPPINGS = {cls.__name__: cls for cls in
    (H3StudioDirector, H3StudioDirectorRefine, H3StudioDirectorSelfLift, H3StudioDirectorGroup, H3StudioFrameGroup, H3StudioGroupsCombine)}
