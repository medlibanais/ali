"""Which MakeHuman assets go into the app's human model.

Keys are the ids the app uses (src/avatar/wardrobe.ts lists the same ids
with their labels). 'dir' is the asset's folder inside an unpacked asset
pack. 'gray' stores the texture as light and dark only, so the app can
tint it to any colour (hair, brows, plain clothes).
"""
import re

TEX_SIZE = {'skin': 2048, 'eyes': 512, 'teeth': 256, 'tongue': 128, 'lashes': 256, 'brows': 512, 'hair': 1024, 'clothes': 1024, 'glasses': 256}

EYES = {'eyes': {'dir': 'high-poly', 'kind': 'eyes', 'material': '../materials/grey.mhmat'}}
TEETH = {'teeth': {'dir': 'teeth_base', 'kind': 'teeth'}}
TONGUE = {'tongue': {'dir': 'tongue01', 'kind': 'tongue'}}
EYELASHES = {f'lashes{i}': {'dir': f'eyelashes0{i}', 'kind': 'lashes'} for i in range(1, 4)}
EYEBROWS = {f'brow{i}': {'dir': f'eyebrow{i:03d}', 'kind': 'brows', 'gray': True} for i in range(1, 13)}
HAIR = {n: {'dir': n, 'kind': 'hair', 'gray': True} for n in ('short01', 'short02', 'short03', 'short04', 'bob01', 'bob02', 'long01', 'ponytail01', 'braid01')}
# Hair from the hair01 pack: id -> asset folder.
HAIR.update({k: {'dir': v, 'kind': 'hair', 'gray': True} for k, v in dict(
    blunt_bob='toigo_blunt_bob', blunt_bob_bangs='toigo_blunt_bob_with_bangs', inverted_bob='toigo_inverted_bob', inverted_bob_bangs='toigo_inverted_bob_with_bangs',
    curled_bob='toigo_curled_under_bob', curled_bob_bangs='toigo_curled_under_bob_with_bangs', straight_bangs='cortu_straight_bangs',
    double_braid='elvs_double_mh_braid', french_braid='elvs_french_braid_variation', braid_bun='elvs_reverse_french_braid_bun',
    bun='rehmanpolanski_hair_bun_brown', bobcut='littleright_bobcut_hair', wavy_long='culturalibre_hair_01', slick='culturalibre_hair_02',
    tousled='culturalibre_hair_05', spiky='culturalibre_hair_06', curly_bob='cortu_strawberry_cloud_hair',
).items()})


def clothes(**items):
    return {k: {'dir': v, 'kind': 'clothes'} for k, v in items.items()}


def plain(**items):
    return {k: {'dir': v, 'kind': 'clothes', 'gray': True} for k, v in items.items()}


CLOTHES = {
    # Whole outfits
    **clothes(
        m_shirt_jeans='male_casualsuit01', m_longsleeve='male_casualsuit02', m_striped='male_casualsuit03', m_tee_jeans='male_casualsuit04',
        m_jacket='male_casualsuit05', m_white_tee='male_casualsuit06', m_suit='male_elegantsuit01', m_overalls='male_worksuit01',
        f_tee_jeans='female_casualsuit01', f_tee_shorts='female_casualsuit02', f_blouse_skirt='female_elegantsuit01', f_sport='female_sportsuit01',
    ),
    # Tops and bottoms to combine. The plain ones take any colour.
    **plain(tee='elvs_crude_t-shirt_male', fitted_tee='joepal_crude_t-shirt_female',
            sweater='toigo_fisherman_sweater', trousers='toigo_wool_pants', cargo='cortu_cargo_pants'),
    **clothes(tank='toigo_camisole_top', print_top='toigo_keyhole_tank_top'),
    **clothes(shoes1='shoes01', shoes2='shoes02', shoes3='shoes03', shoes4='shoes04', shoes5='shoes05', shoes6='shoes06'),
}
for _k, _v in dict(rimless='kwnet_at_optical_glasses', slim='spamrakuen_sagerfrogs_glasses_02', sunglasses='frankyaye_glasses_library_male',
                   aviator='toigo_round_glasses_leopard', bold='spamrakuen_tbm_glasses_frames_01').items():
    CLOTHES['glasses_' + _k] = {'dir': _v, 'kind': 'glasses'}

CLOTHES.update(clothes(
    dress_tiered='toigo_dress_with_tiered_skirt', dress_halter='toigo_halter_dress_knee_length', dress_camisole='toigo_camisole_dress_with_full_skirt',
    dress_keyhole='toigo_keyhole_neck_dress', dress_shift='toigo_shift_dress', dress_lace='toigo_bodice_dress_with_lace_ruffle_skirt', dress_cutout='toigo_cut_out_dress',
    dress_midi='toigo_halter_dress_midi', dress_ruffle='toigo_strapless_ruffle_top_dress', dress_fluted='toigo_halter_dress_with_fluted_skirt', 
    skirt_tiered_mini='toigo_tiered_mini_skirt', skirt_mini1='frankyaye_mini_skirt_01', skirt_mini2='frankyaye_mini_skirt_02', skirt_long='toigo_long_full_skirt',
    skirt_lace='toigo_skirt_with_lace_ruffle',
    suit_bowtie='toigo_suit_with_jacket_and_bowtie', suit_m3='toigo_male_suit_3', suit_f1='toigo_female_suit', suit_f_double='toigo_female_double-breasted_suit',
    suit_dinner='toigo_suit_with_dinner_jacket', suit_m_tie='toigo_male_suit_tie_and_jacket', suit_m_double='toigo_male_double-breasted_suit', suit_f2='toigo_female_suit_2',
    boots_m_ankle='toigo_ankle_boots_male', boots_f_ankle='toigo_ankle_boots_female', cloth_shoes='toigo_mj_cloth_shoes',
    flats='toigo_flats', ballet='toigo_ballet_flats', ballet_bows='toigo_ballet_flats_with_bows', t_bar='cortu_t-bar',
))

SKINS = {f'{e}_{g}': {'dir': f'young_{e}_{g}', 'for': g} for e in ('caucasian', 'asian', 'african') for g in ('male', 'female')}

# Shape targets the app never asks for are left out to keep the file small.
SKIP_TARGETS = re.compile(
    r'uncommonproportions|(min|max)(muscle|weight)-.*(height|proportions|cup|firmness)$|^(foot|hand)-(trans|scale-(depth|horiz|vert))|^(upperarm|lowerarm|upperleg|lowerleg)-scale|'
    r'-trans-(in|out)$|^head-trans|^neck-trans|^torso-trans|^hip-trans|^ear-(rot|trans-(backward|forward)|scale-(depth|vert)|shape)|'
    r'^expr-(neck|nose)|^stomach-navel|^pelvis|^bulge|^leg-valgus|^hand-fingers'
)
