// Written by tools/vehicles/cars.py from the owner's car files: do not edit by hand.
// Each car's mesh is split by place into its body and its four wheels (front left, front right, rear left,
// rear right; see that tool). Sizes are in the model's own units, the car facing +Z with its left at +X.
export const CAR_PARTS = Object.freeze({
 "black-grand-convertible": {
  "vertices": 67125,
  "triangles": 99369,
  "parts": [
   87881,
   2997,
   3201,
   2654,
   2636
  ],
  "length": 0.9794,
  "height": 0.289,
  "width": 0.4138,
  "body": 0.3679,
  "wheels": [
   {
    "x": 0.1464,
    "outer": 0.1748,
    "inner": 0.118,
    "y": 0.0722,
    "z": 0.3342,
    "r": 0.072
   },
   {
    "x": -0.1456,
    "outer": 0.174,
    "inner": 0.1172,
    "y": 0.0722,
    "z": 0.3342,
    "r": 0.072
   },
   {
    "x": 0.1464,
    "outer": 0.1748,
    "inner": 0.118,
    "y": 0.0705,
    "z": -0.2488,
    "r": 0.0705
   },
   {
    "x": -0.1457,
    "outer": 0.1741,
    "inner": 0.1173,
    "y": 0.0705,
    "z": -0.2488,
    "r": 0.0705
   }
  ],
  "lamps": {
   "head": [
    0.0924,
    0.107,
    0.4815
   ],
   "tail": [
    0.1091,
    0.1257,
    -0.4778
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "black-grand-convertible.bin",
   "color4k": "black-grand-convertible-color-4k.jpg",
   "color2k": "black-grand-convertible-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "black-grand-convertible-rm-4k.webp",
   "rm2k": "black-grand-convertible-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "black-grand-convertible-normal-4k.png",
   "normal2k": "black-grand-convertible-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "d9efddc6a2df74c1fcd7e6e77b1806ee160ad6b54e4215d86ea7e3b5a98998b8",
  "bytes": {
   "lite": 3880423,
   "full": 7809556
  }
 },
 "black-luxury-suv": {
  "vertices": 91986,
  "triangles": 111016,
  "parts": [
   80599,
   10361,
   8471,
   6117,
   5468
  ],
  "length": 0.9795,
  "height": 0.4092,
  "width": 0.5192,
  "body": 0.4718,
  "wheels": [
   {
    "x": 0.2018,
    "outer": 0.2302,
    "inner": 0.1734,
    "y": 0.0891,
    "z": 0.2996,
    "r": 0.0891
   },
   {
    "x": -0.2101,
    "outer": 0.2385,
    "inner": 0.1817,
    "y": 0.0891,
    "z": 0.2996,
    "r": 0.0891
   },
   {
    "x": 0.2055,
    "outer": 0.2339,
    "inner": 0.1771,
    "y": 0.0885,
    "z": -0.2608,
    "r": 0.0882
   },
   {
    "x": -0.1897,
    "outer": 0.2181,
    "inner": 0.1613,
    "y": 0.0885,
    "z": -0.2608,
    "r": 0.0882
   }
  ],
  "lamps": {
   "head": [
    0.1121,
    0.1861,
    0.4703
   ],
   "tail": [
    0.1419,
    0.1832,
    -0.4751
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "black-luxury-suv.bin",
   "color4k": "black-luxury-suv-color-4k.jpg",
   "color2k": "black-luxury-suv-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "black-luxury-suv-rm-4k.webp",
   "rm2k": "black-luxury-suv-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "black-luxury-suv-normal-4k.png",
   "normal2k": "black-luxury-suv-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "8090a90e88eb78ad38fc65739709576756fe3f1ac99ef90de1248dd4c82ab158",
  "bytes": {
   "lite": 4715357,
   "full": 8925609
  }
 },
 "black-pickup": {
  "vertices": 11658,
  "triangles": 9797,
  "parts": [
   7921,
   399,
   471,
   473,
   533
  ],
  "length": 0.9995,
  "height": 0.4019,
  "width": 0.5093,
  "body": 0.4185,
  "wheels": [
   {
    "x": 0.1802,
    "outer": 0.2092,
    "inner": 0.1513,
    "y": 0.0765,
    "z": 0.3179,
    "r": 0.0765
   },
   {
    "x": -0.169,
    "outer": 0.198,
    "inner": 0.14,
    "y": 0.0765,
    "z": 0.3179,
    "r": 0.0765
   },
   {
    "x": 0.1739,
    "outer": 0.2029,
    "inner": 0.1449,
    "y": 0.0814,
    "z": -0.2949,
    "r": 0.081
   },
   {
    "x": -0.1661,
    "outer": 0.1951,
    "inner": 0.1371,
    "y": 0.0814,
    "z": -0.2949,
    "r": 0.081
   }
  ],
  "lamps": {
   "head": [
    0.1179,
    0.166,
    0.4709
   ],
   "tail": [
    0.1414,
    0.2024,
    -0.4861
   ]
  },
  "metallic": 0,
  "roughness": 0.8999999761581421,
  "normalScale": 1.0,
  "files": {
   "mesh": "black-pickup.bin",
   "color4k": "black-pickup-color-4k.jpg",
   "color2k": "black-pickup-color-2k.jpg",
   "colorSize": 8192
  },
  "sha256": "4af3c89ccf52a1be8166b3b6e3afd40fceefdacce58c8b0d2f536984ad6d2b51",
  "bytes": {
   "lite": 928206,
   "full": 2050449
  }
 },
 "black-square-suv": {
  "vertices": 11499,
  "triangles": 9755,
  "parts": [
   8556,
   265,
   262,
   336,
   336
  ],
  "length": 0.9995,
  "height": 0.4517,
  "width": 0.5103,
  "body": 0.4829,
  "wheels": [
   {
    "x": 0.2071,
    "outer": 0.2361,
    "inner": 0.1781,
    "y": 0.084,
    "z": 0.3005,
    "r": 0.084
   },
   {
    "x": -0.2071,
    "outer": 0.2361,
    "inner": 0.1781,
    "y": 0.084,
    "z": 0.3005,
    "r": 0.084
   },
   {
    "x": 0.2071,
    "outer": 0.2361,
    "inner": 0.1781,
    "y": 0.0942,
    "z": -0.2957,
    "r": 0.0855
   },
   {
    "x": -0.2071,
    "outer": 0.2361,
    "inner": 0.1781,
    "y": 0.0942,
    "z": -0.2957,
    "r": 0.0855
   }
  ],
  "lamps": {
   "head": [
    0.1184,
    0.1475,
    0.4885
   ],
   "tail": [
    0.113,
    0.2383,
    -0.4963
   ]
  },
  "metallic": 0.0,
  "roughness": 0.5,
  "normalScale": 1.0,
  "files": {
   "mesh": "black-square-suv.bin",
   "color4k": "black-square-suv-color-4k.jpg",
   "color2k": "black-square-suv-color-2k.jpg",
   "colorSize": 8192
  },
  "sha256": "416c70a0a25c9f7d6e5e1dd52f0b46ec9b8fbf0a4762a205f63ae33761ea5f58",
  "bytes": {
   "lite": 1030974,
   "full": 2321661
  }
 },
 "blue-off-roader": {
  "vertices": 14623,
  "triangles": 10519,
  "parts": [
   8779,
   450,
   449,
   442,
   399
  ],
  "length": 0.9995,
  "height": 0.4175,
  "width": 0.5288,
  "body": 0.5288,
  "wheels": [
   {
    "x": 0.2349,
    "outer": 0.2639,
    "inner": 0.2059,
    "y": 0.1084,
    "z": 0.3328,
    "r": 0.1079
   },
   {
    "x": -0.2349,
    "outer": 0.2639,
    "inner": 0.2059,
    "y": 0.1084,
    "z": 0.3328,
    "r": 0.1079
   },
   {
    "x": 0.2354,
    "outer": 0.2644,
    "inner": 0.2064,
    "y": 0.1079,
    "z": -0.3341,
    "r": 0.1079
   },
   {
    "x": -0.2354,
    "outer": 0.2644,
    "inner": 0.2064,
    "y": 0.1079,
    "z": -0.3341,
    "r": 0.1079
   }
  ],
  "lamps": {
   "head": [
    0.1267,
    0.1553,
    0.4827
   ],
   "tail": [
    0.1687,
    0.1685,
    -0.4851
   ]
  },
  "metallic": 0,
  "roughness": 0.8999999761581421,
  "normalScale": 1.0,
  "files": {
   "mesh": "blue-off-roader.bin",
   "color4k": "blue-off-roader-color-4k.jpg",
   "color2k": "blue-off-roader-color-2k.jpg",
   "colorSize": 8192
  },
  "sha256": "1e046dce2aebfd65f0cfd58a6e0903710dc89d810edd62ed7faf0167337a5264",
  "bytes": {
   "lite": 1176760,
   "full": 2490307
  }
 },
 "bronze-spyder": {
  "vertices": 73271,
  "triangles": 98585,
  "parts": [
   81208,
   3470,
   3250,
   5654,
   5003
  ],
  "length": 0.9794,
  "height": 0.2779,
  "width": 0.493,
  "body": 0.423,
  "wheels": [
   {
    "x": 0.1796,
    "outer": 0.208,
    "inner": 0.1512,
    "y": 0.0707,
    "z": 0.2743,
    "r": 0.069
   },
   {
    "x": -0.1787,
    "outer": 0.2071,
    "inner": 0.1503,
    "y": 0.0707,
    "z": 0.2743,
    "r": 0.069
   },
   {
    "x": 0.1797,
    "outer": 0.2081,
    "inner": 0.1513,
    "y": 0.0764,
    "z": -0.3138,
    "r": 0.0764
   },
   {
    "x": -0.1787,
    "outer": 0.2071,
    "inner": 0.1503,
    "y": 0.0764,
    "z": -0.3138,
    "r": 0.0764
   }
  ],
  "lamps": {
   "head": [
    0.1118,
    0.096,
    0.4647
   ],
   "tail": [
    0.1137,
    0.1284,
    -0.4776
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "bronze-spyder.bin",
   "color4k": "bronze-spyder-color-4k.jpg",
   "color2k": "bronze-spyder-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "bronze-spyder-rm-4k.webp",
   "rm2k": "bronze-spyder-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "bronze-spyder-normal-4k.png",
   "normal2k": "bronze-spyder-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "785bf7085af2a5bf0ef68879f4c86a5140c064e75c5e7951069bdc724b8c8992",
  "bytes": {
   "lite": 4369292,
   "full": 8782029
  }
 },
 "camo-expedition": {
  "vertices": 81530,
  "triangles": 103887,
  "parts": [
   90199,
   3203,
   3101,
   3702,
   3682
  ],
  "length": 0.977,
  "height": 0.5086,
  "width": 0.485,
  "body": 0.451,
  "wheels": [
   {
    "x": 0.1981,
    "outer": 0.2264,
    "inner": 0.1697,
    "y": 0.0923,
    "z": 0.2856,
    "r": 0.0923
   },
   {
    "x": -0.1964,
    "outer": 0.2248,
    "inner": 0.1681,
    "y": 0.0923,
    "z": 0.2856,
    "r": 0.0923
   },
   {
    "x": 0.1763,
    "outer": 0.2046,
    "inner": 0.1479,
    "y": 0.0926,
    "z": -0.3245,
    "r": 0.0923
   },
   {
    "x": -0.1751,
    "outer": 0.2034,
    "inner": 0.1467,
    "y": 0.0926,
    "z": -0.3245,
    "r": 0.0923
   }
  ],
  "lamps": {
   "head": [
    0.1114,
    0.1671,
    0.4707
   ],
   "tail": [
    0.1514,
    0.2521,
    -0.4653
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "camo-expedition.bin",
   "color4k": "camo-expedition-color-4k.jpg",
   "color2k": "camo-expedition-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "camo-expedition-rm-4k.webp",
   "rm2k": "camo-expedition-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "camo-expedition-normal-4k.png",
   "normal2k": "camo-expedition-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "2208151246a1d960b7b555576236310b0e23e9487b6faa93ddf33af3fad070cb",
  "bytes": {
   "lite": 4401841,
   "full": 8612917
  }
 },
 "classic-two-tone": {
  "vertices": 69513,
  "triangles": 99247,
  "parts": [
   89763,
   1584,
   1809,
   2998,
   3093
  ],
  "length": 0.9781,
  "height": 0.3283,
  "width": 0.3851,
  "body": 0.381,
  "wheels": [
   {
    "x": 0.1505,
    "outer": 0.1788,
    "inner": 0.1221,
    "y": 0.0748,
    "z": 0.3287,
    "r": 0.0748
   },
   {
    "x": -0.1515,
    "outer": 0.1799,
    "inner": 0.1232,
    "y": 0.0748,
    "z": 0.3287,
    "r": 0.0748
   },
   {
    "x": 0.1623,
    "outer": 0.1907,
    "inner": 0.134,
    "y": 0.0778,
    "z": -0.2486,
    "r": 0.0778
   },
   {
    "x": -0.1624,
    "outer": 0.1907,
    "inner": 0.134,
    "y": 0.0778,
    "z": -0.2486,
    "r": 0.0778
   }
  ],
  "lamps": {
   "head": [
    0.1133,
    0.1049,
    0.484
   ],
   "tail": [
    0.1509,
    0.1869,
    -0.4814
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "classic-two-tone.bin",
   "color4k": "classic-two-tone-color-4k.jpg",
   "color2k": "classic-two-tone-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "classic-two-tone-rm-4k.webp",
   "rm2k": "classic-two-tone-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "classic-two-tone-normal-4k.png",
   "normal2k": "classic-two-tone-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "ec23e0a806f7d74dba5960941fefd56a6379ed591c79a625b402e97138b9129d",
  "bytes": {
   "lite": 4214688,
   "full": 8075003
  }
 },
 "gold-hypercar": {
  "vertices": 70215,
  "triangles": 96291,
  "parts": [
   78087,
   5170,
   4978,
   3081,
   4975
  ],
  "length": 0.9774,
  "height": 0.4727,
  "width": 0.8613,
  "body": 0.5339,
  "wheels": [
   {
    "x": 0.2381,
    "outer": 0.2664,
    "inner": 0.2098,
    "y": 0.085,
    "z": 0.2026,
    "r": 0.085
   },
   {
    "x": -0.2388,
    "outer": 0.2671,
    "inner": 0.2104,
    "y": 0.085,
    "z": 0.2026,
    "r": 0.085
   },
   {
    "x": 0.2381,
    "outer": 0.2664,
    "inner": 0.2097,
    "y": 0.0868,
    "z": -0.2845,
    "r": 0.0865
   },
   {
    "x": -0.2387,
    "outer": 0.2671,
    "inner": 0.2104,
    "y": 0.0868,
    "z": -0.2845,
    "r": 0.0865
   }
  ],
  "lamps": {
   "head": [
    0.167,
    0.1455,
    0.3878
   ],
   "tail": [
    0.1498,
    0.2372,
    -0.4719
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "gold-hypercar.bin",
   "color4k": "gold-hypercar-color-4k.jpg",
   "color2k": "gold-hypercar-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "gold-hypercar-rm-4k.webp",
   "rm2k": "gold-hypercar-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "gold-hypercar-normal-4k.png",
   "normal2k": "gold-hypercar-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "a29227def49be479335b7d5d76966326f195f9958705da37ec7f6f528a7a8068",
  "bytes": {
   "lite": 4098456,
   "full": 8584934
  }
 },
 "grey-grand-tourer": {
  "vertices": 67018,
  "triangles": 97114,
  "parts": [
   71210,
   6892,
   7361,
   5828,
   5823
  ],
  "length": 0.9802,
  "height": 0.3099,
  "width": 0.455,
  "body": 0.4443,
  "wheels": [
   {
    "x": 0.1938,
    "outer": 0.2223,
    "inner": 0.1654,
    "y": 0.0838,
    "z": 0.3086,
    "r": 0.0838
   },
   {
    "x": -0.1927,
    "outer": 0.2211,
    "inner": 0.1643,
    "y": 0.0838,
    "z": 0.3086,
    "r": 0.0838
   },
   {
    "x": 0.1713,
    "outer": 0.1997,
    "inner": 0.1429,
    "y": 0.081,
    "z": -0.2539,
    "r": 0.0809
   },
   {
    "x": -0.1707,
    "outer": 0.1991,
    "inner": 0.1422,
    "y": 0.081,
    "z": -0.2539,
    "r": 0.0809
   }
  ],
  "lamps": {
   "head": [
    0.1089,
    0.1262,
    0.4718
   ],
   "tail": [
    0.1145,
    0.1613,
    -0.4744
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "grey-grand-tourer.bin",
   "color4k": "grey-grand-tourer-color-4k.jpg",
   "color2k": "grey-grand-tourer-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "grey-grand-tourer-rm-4k.webp",
   "rm2k": "grey-grand-tourer-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "grey-grand-tourer-normal-4k.png",
   "normal2k": "grey-grand-tourer-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "643fca7d4e2f16257a42429cee7bbdfb469742e49bd6d4ab57c322116389baba",
  "bytes": {
   "lite": 3970260,
   "full": 8529451
  }
 },
 "grey-saloon": {
  "vertices": 11607,
  "triangles": 10225,
  "parts": [
   7095,
   784,
   782,
   780,
   784
  ],
  "length": 0.9995,
  "height": 0.3276,
  "width": 0.478,
  "body": 0.4331,
  "wheels": [
   {
    "x": 0.1778,
    "outer": 0.2068,
    "inner": 0.1488,
    "y": 0.075,
    "z": 0.3298,
    "r": 0.075
   },
   {
    "x": -0.1778,
    "outer": 0.2068,
    "inner": 0.1488,
    "y": 0.075,
    "z": 0.3298,
    "r": 0.075
   },
   {
    "x": 0.1778,
    "outer": 0.2068,
    "inner": 0.1488,
    "y": 0.075,
    "z": -0.2712,
    "r": 0.075
   },
   {
    "x": -0.1778,
    "outer": 0.2068,
    "inner": 0.1488,
    "y": 0.075,
    "z": -0.2712,
    "r": 0.075
   }
  ],
  "lamps": {
   "head": [
    0.1072,
    0.1406,
    0.4851
   ],
   "tail": [
    0.1165,
    0.1621,
    -0.4788
   ]
  },
  "metallic": 0.0,
  "roughness": 0.5,
  "normalScale": 1.0,
  "files": {
   "mesh": "grey-saloon.bin",
   "color4k": "grey-saloon-color-4k.jpg",
   "color2k": "grey-saloon-color-2k.jpg",
   "colorSize": 8192
  },
  "sha256": "95533b178cba5eba754dec13293bf67246439688fbac17eb4128e062f5b7763b",
  "bytes": {
   "lite": 1042576,
   "full": 2383512
  }
 },
 "midnight-saloon": {
  "vertices": 73960,
  "triangles": 99352,
  "parts": [
   76813,
   6533,
   6377,
   4556,
   5073
  ],
  "length": 0.9765,
  "height": 0.3275,
  "width": 0.4437,
  "body": 0.438,
  "wheels": [
   {
    "x": 0.1914,
    "outer": 0.2197,
    "inner": 0.1631,
    "y": 0.0835,
    "z": 0.3182,
    "r": 0.0835
   },
   {
    "x": -0.1904,
    "outer": 0.2187,
    "inner": 0.1621,
    "y": 0.0835,
    "z": 0.3182,
    "r": 0.0835
   },
   {
    "x": 0.1758,
    "outer": 0.2041,
    "inner": 0.1475,
    "y": 0.0776,
    "z": -0.2553,
    "r": 0.0776
   },
   {
    "x": -0.1757,
    "outer": 0.204,
    "inner": 0.1474,
    "y": 0.0776,
    "z": -0.2553,
    "r": 0.0776
   }
  ],
  "lamps": {
   "head": [
    0.1162,
    0.1304,
    0.464
   ],
   "tail": [
    0.1103,
    0.1494,
    -0.4731
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "midnight-saloon.bin",
   "color4k": "midnight-saloon-color-4k.jpg",
   "color2k": "midnight-saloon-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "midnight-saloon-rm-4k.webp",
   "rm2k": "midnight-saloon-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "midnight-saloon-normal-4k.png",
   "normal2k": "midnight-saloon-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "32feb3e7ae247d1a9603772772fad172d5f9f81572f946028bd4db40c6bcdeac",
  "bytes": {
   "lite": 4115446,
   "full": 8480367
  }
 },
 "mint-sports-coupe": {
  "vertices": 12926,
  "triangles": 10902,
  "parts": [
   8139,
   620,
   540,
   810,
   793
  ],
  "length": 0.9995,
  "height": 0.2749,
  "width": 0.4888,
  "body": 0.4771,
  "wheels": [
   {
    "x": 0.1846,
    "outer": 0.2136,
    "inner": 0.1557,
    "y": 0.072,
    "z": 0.3015,
    "r": 0.072
   },
   {
    "x": -0.1822,
    "outer": 0.2112,
    "inner": 0.1532,
    "y": 0.072,
    "z": 0.3015,
    "r": 0.072
   },
   {
    "x": 0.21,
    "outer": 0.239,
    "inner": 0.181,
    "y": 0.0794,
    "z": -0.3147,
    "r": 0.078
   },
   {
    "x": -0.2006,
    "outer": 0.2296,
    "inner": 0.1716,
    "y": 0.0794,
    "z": -0.3147,
    "r": 0.078
   }
  ],
  "lamps": {
   "head": [
    0.1321,
    0.123,
    0.4539
   ],
   "tail": [
    0.1213,
    0.1616,
    -0.4778
   ]
  },
  "metallic": 0.0,
  "roughness": 0.5,
  "normalScale": 1.0,
  "files": {
   "mesh": "mint-sports-coupe.bin",
   "color4k": "mint-sports-coupe-color-4k.jpg",
   "color2k": "mint-sports-coupe-color-2k.jpg",
   "colorSize": 8192
  },
  "sha256": "525ac8cebf8edef0ec60885f7a484b27d526b71ddf21e9ebdbb5b970a602449d",
  "bytes": {
   "lite": 1059520,
   "full": 2260853
  }
 },
 "peach-suv": {
  "vertices": 72846,
  "triangles": 98580,
  "parts": [
   83938,
   2809,
   3045,
   4284,
   4504
  ],
  "length": 0.9799,
  "height": 0.3929,
  "width": 0.4911,
  "body": 0.4404,
  "wheels": [
   {
    "x": 0.1919,
    "outer": 0.2203,
    "inner": 0.1635,
    "y": 0.0794,
    "z": 0.3131,
    "r": 0.0794
   },
   {
    "x": -0.1892,
    "outer": 0.2177,
    "inner": 0.1608,
    "y": 0.0794,
    "z": 0.3131,
    "r": 0.0794
   },
   {
    "x": 0.192,
    "outer": 0.2205,
    "inner": 0.1636,
    "y": 0.0794,
    "z": -0.2708,
    "r": 0.0794
   },
   {
    "x": -0.1893,
    "outer": 0.2178,
    "inner": 0.1609,
    "y": 0.0794,
    "z": -0.2708,
    "r": 0.0794
   }
  ],
  "lamps": {
   "head": [
    0.1177,
    0.1347,
    0.4716
   ],
   "tail": [
    0.1196,
    0.1977,
    -0.4769
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "peach-suv.bin",
   "color4k": "peach-suv-color-4k.jpg",
   "color2k": "peach-suv-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "peach-suv-rm-4k.webp",
   "rm2k": "peach-suv-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "peach-suv-normal-4k.png",
   "normal2k": "peach-suv-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "da7e2d1a64ad5d426bb72d94aa2cfde2f13ad9121a7c0850af07703fccb8256e",
  "bytes": {
   "lite": 4222080,
   "full": 8314867
  }
 },
 "pearl-convertible": {
  "vertices": 69897,
  "triangles": 97373,
  "parts": [
   78234,
   3970,
   2981,
   6178,
   6010
  ],
  "length": 0.9783,
  "height": 0.301,
  "width": 0.4387,
  "body": 0.3977,
  "wheels": [
   {
    "x": 0.1608,
    "outer": 0.1892,
    "inner": 0.1324,
    "y": 0.0778,
    "z": 0.273,
    "r": 0.0778
   },
   {
    "x": -0.1696,
    "outer": 0.198,
    "inner": 0.1413,
    "y": 0.0778,
    "z": 0.273,
    "r": 0.0778
   },
   {
    "x": 0.1723,
    "outer": 0.2006,
    "inner": 0.1439,
    "y": 0.0918,
    "z": -0.2979,
    "r": 0.0822
   },
   {
    "x": -0.1712,
    "outer": 0.1996,
    "inner": 0.1428,
    "y": 0.0918,
    "z": -0.2979,
    "r": 0.0822
   }
  ],
  "lamps": {
   "head": [
    0.0997,
    0.1036,
    0.4724
   ],
   "tail": [
    0.1066,
    0.1427,
    -0.4755
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "pearl-convertible.bin",
   "color4k": "pearl-convertible-color-4k.jpg",
   "color2k": "pearl-convertible-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "pearl-convertible-rm-4k.webp",
   "rm2k": "pearl-convertible-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "pearl-convertible-normal-4k.png",
   "normal2k": "pearl-convertible-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "a92f0d635e8fef732d4c1b2886b170aef2cf925b501ada67b4c205acd29ae6d3",
  "bytes": {
   "lite": 4354933,
   "full": 10213673
  }
 },
 "red-winged-supercar": {
  "vertices": 74694,
  "triangles": 103041,
  "parts": [
   93230,
   2324,
   2395,
   2492,
   2600
  ],
  "length": 0.9804,
  "height": 0.2647,
  "width": 0.4365,
  "body": 0.4332,
  "wheels": [
   {
    "x": 0.1697,
    "outer": 0.1981,
    "inner": 0.1413,
    "y": 0.0677,
    "z": 0.2598,
    "r": 0.0676
   },
   {
    "x": -0.1699,
    "outer": 0.1983,
    "inner": 0.1414,
    "y": 0.0677,
    "z": 0.2598,
    "r": 0.0676
   },
   {
    "x": 0.1877,
    "outer": 0.2162,
    "inner": 0.1593,
    "y": 0.075,
    "z": -0.2869,
    "r": 0.075
   },
   {
    "x": -0.1879,
    "outer": 0.2163,
    "inner": 0.1594,
    "y": 0.075,
    "z": -0.2869,
    "r": 0.075
   }
  ],
  "lamps": {
   "head": [
    0.1208,
    0.0808,
    0.4647
   ],
   "tail": [
    0.1468,
    0.1363,
    -0.4877
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "red-winged-supercar.bin",
   "color4k": "red-winged-supercar-color-4k.jpg",
   "color2k": "red-winged-supercar-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "red-winged-supercar-rm-4k.webp",
   "rm2k": "red-winged-supercar-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "red-winged-supercar-normal-4k.png",
   "normal2k": "red-winged-supercar-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "e97afb51dbc3105c0d0388e89d3e5797686cdea5164ac43d76bab2d98ccfc31a",
  "bytes": {
   "lite": 4252939,
   "full": 7787986
  }
 },
 "state-limousine": {
  "vertices": 10758,
  "triangles": 10565,
  "parts": [
   8450,
   451,
   453,
   604,
   607
  ],
  "length": 0.9995,
  "height": 0.3442,
  "width": 0.4653,
  "body": 0.4206,
  "wheels": [
   {
    "x": 0.1793,
    "outer": 0.2083,
    "inner": 0.1503,
    "y": 0.075,
    "z": 0.325,
    "r": 0.075
   },
   {
    "x": -0.1739,
    "outer": 0.2029,
    "inner": 0.1449,
    "y": 0.075,
    "z": 0.325,
    "r": 0.075
   },
   {
    "x": 0.1793,
    "outer": 0.2083,
    "inner": 0.1503,
    "y": 0.078,
    "z": -0.3171,
    "r": 0.078
   },
   {
    "x": -0.1739,
    "outer": 0.2029,
    "inner": 0.1449,
    "y": 0.078,
    "z": -0.3171,
    "r": 0.078
   }
  ],
  "lamps": {
   "head": [
    0.1101,
    0.1338,
    0.48
   ],
   "tail": [
    0.1526,
    0.1499,
    -0.4973
   ]
  },
  "metallic": 0,
  "roughness": 0.8999999761581421,
  "normalScale": 1.0,
  "files": {
   "mesh": "state-limousine.bin",
   "color4k": "state-limousine-color-4k.jpg",
   "color2k": "state-limousine-color-2k.jpg",
   "colorSize": 8192
  },
  "sha256": "aabb43427517119ef6c8b2832b627c8415812dfb33a9b137c2cc7c1bceec19a5",
  "bytes": {
   "lite": 912435,
   "full": 1977321
  }
 },
 "white-roadster": {
  "vertices": 10803,
  "triangles": 10088,
  "parts": [
   9262,
   179,
   177,
   236,
   234
  ],
  "length": 0.9995,
  "height": 0.2905,
  "width": 0.4829,
  "body": 0.4741,
  "wheels": [
   {
    "x": 0.2066,
    "outer": 0.2356,
    "inner": 0.1776,
    "y": 0.0735,
    "z": 0.2883,
    "r": 0.0735
   },
   {
    "x": -0.2066,
    "outer": 0.2356,
    "inner": 0.1776,
    "y": 0.0735,
    "z": 0.2883,
    "r": 0.0735
   },
   {
    "x": 0.2066,
    "outer": 0.2356,
    "inner": 0.1776,
    "y": 0.078,
    "z": -0.2932,
    "r": 0.078
   },
   {
    "x": -0.2066,
    "outer": 0.2356,
    "inner": 0.1776,
    "y": 0.078,
    "z": -0.2932,
    "r": 0.078
   }
  ],
  "lamps": {
   "head": [
    0.114,
    0.1118,
    0.4827
   ],
   "tail": [
    0.1165,
    0.155,
    -0.4885
   ]
  },
  "metallic": 0.0,
  "roughness": 0.5,
  "normalScale": 1.0,
  "files": {
   "mesh": "white-roadster.bin",
   "color4k": "white-roadster-color-4k.jpg",
   "color2k": "white-roadster-color-2k.jpg",
   "colorSize": 8192
  },
  "sha256": "06e8bc6337702bae311a6e31d192114f0ff165a01924337cb40f58a093b56849",
  "bytes": {
   "lite": 1066150,
   "full": 2389985
  }
 },
 "white-square-suv": {
  "vertices": 86803,
  "triangles": 113459,
  "parts": [
   93202,
   3889,
   3727,
   6527,
   6114
  ],
  "length": 0.978,
  "height": 0.4378,
  "width": 0.4664,
  "body": 0.4586,
  "wheels": [
   {
    "x": 0.1996,
    "outer": 0.228,
    "inner": 0.1713,
    "y": 0.09,
    "z": 0.2963,
    "r": 0.09
   },
   {
    "x": -0.2011,
    "outer": 0.2295,
    "inner": 0.1728,
    "y": 0.09,
    "z": 0.2963,
    "r": 0.09
   },
   {
    "x": 0.1744,
    "outer": 0.2027,
    "inner": 0.146,
    "y": 0.088,
    "z": -0.3011,
    "r": 0.088
   },
   {
    "x": -0.1753,
    "outer": 0.2037,
    "inner": 0.147,
    "y": 0.088,
    "z": -0.3011,
    "r": 0.088
   }
  ],
  "lamps": {
   "head": [
    0.1133,
    0.1431,
    0.4781
   ],
   "tail": [
    0.1425,
    0.2292,
    -0.4502
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "white-square-suv.bin",
   "color4k": "white-square-suv-color-4k.jpg",
   "color2k": "white-square-suv-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "white-square-suv-rm-4k.webp",
   "rm2k": "white-square-suv-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "white-square-suv-normal-4k.png",
   "normal2k": "white-square-suv-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "edb1dea10abd6e3a74de61313501e51061bd33bdfcf485faf445efcb577f9879",
  "bytes": {
   "lite": 4886514,
   "full": 9058605
  }
 },
 "yellow-classic-roadster": {
  "vertices": 77087,
  "triangles": 101193,
  "parts": [
   87778,
   3261,
   3154,
   3462,
   3538
  ],
  "length": 0.9767,
  "height": 0.2936,
  "width": 0.4611,
  "body": 0.4418,
  "wheels": [
   {
    "x": 0.1977,
    "outer": 0.226,
    "inner": 0.1694,
    "y": 0.082,
    "z": 0.3045,
    "r": 0.082
   },
   {
    "x": -0.1979,
    "outer": 0.2263,
    "inner": 0.1696,
    "y": 0.082,
    "z": 0.3045,
    "r": 0.082
   },
   {
    "x": 0.1882,
    "outer": 0.2165,
    "inner": 0.1599,
    "y": 0.085,
    "z": -0.2381,
    "r": 0.085
   },
   {
    "x": -0.1885,
    "outer": 0.2168,
    "inner": 0.1602,
    "y": 0.085,
    "z": -0.2381,
    "r": 0.085
   }
  ],
  "lamps": {
   "head": [
    0.1324,
    0.1048,
    0.4863
   ],
   "tail": [
    0.1083,
    0.1189,
    -0.4876
   ]
  },
  "metallic": 1.0,
  "roughness": 1.0,
  "normalScale": 1.0,
  "files": {
   "mesh": "yellow-classic-roadster.bin",
   "color4k": "yellow-classic-roadster-color-4k.jpg",
   "color2k": "yellow-classic-roadster-color-2k.jpg",
   "colorSize": 8192,
   "rm4k": "yellow-classic-roadster-rm-4k.webp",
   "rm2k": "yellow-classic-roadster-rm-2k.webp",
   "rmSize": 4096,
   "normal4k": "yellow-classic-roadster-normal-4k.png",
   "normal2k": "yellow-classic-roadster-normal-2k.webp",
   "normalSize": 4096
  },
  "sha256": "d589f8c674bece930e90a55080fdef9d22d2f9bb942520a7eb4008cfb5142157",
  "bytes": {
   "lite": 4522835,
   "full": 9201928
  }
 }
});
